import { Database } from "bun:sqlite";
import type { PersistenceAdapter, InstanceState, Marking } from "petri-ts";
import type { WorkflowStatus } from "../types.js";
import type { TimeoutEntry, HistoryEntry } from "./interface.js";
import { CREATE_WORKFLOW_INSTANCES, CREATE_TRANSITION_HISTORY, CREATE_TIMEOUT_ENTRIES } from "./schema.js";

export type ExtendedInstanceState<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = InstanceState<Place> & {
  workflowName: string;
  context: Ctx;
  status: WorkflowStatus;
};

type Row = {
  id: string;
  workflow_name: string;
  marking: string;
  context_data: string;
  version: string | null;
  status: string;
  created_at: number;
  updated_at: number;
};

export function sqliteAdapter<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
>(
  db: Database,
  workflowName: string,
): PersistenceAdapter<Place> & {
  exists(id: string): Promise<boolean>;
  loadExtended(id: string): Promise<ExtendedInstanceState<Place, Ctx>>;
  saveExtended(
    id: string,
    state: ExtendedInstanceState<Place, Ctx>,
  ): Promise<void>;
  listActive(): Promise<string[]>;
  scheduleTimeout(entry: TimeoutEntry): Promise<void>;
  getExpiredTimeouts(instanceId: string, now: number): Promise<TimeoutEntry[]>;
  markTimeoutFired(id: string): Promise<void>;
  clearTimeouts(instanceId: string, transitionName?: string): Promise<void>;
  hasPendingTimeouts(instanceId: string): Promise<boolean>;
  recordTransition(entry: Omit<HistoryEntry, "id">): Promise<void>;
  getHistory(instanceId: string): Promise<HistoryEntry[]>;
} {
  db.run(CREATE_WORKFLOW_INSTANCES);
  db.run(CREATE_TRANSITION_HISTORY);
  db.run(CREATE_TIMEOUT_ENTRIES);

  const selectOne = db.query<Row, [string]>(
    "SELECT * FROM workflow_instances WHERE id = ?",
  );
  const selectActive = db.query<Pick<Row, "id">, [string]>(
    "SELECT id FROM workflow_instances WHERE status = 'active' AND workflow_name = ?",
  );
  const insertRow = db.query<
    void,
    [string, string, string, string, string | null, string]
  >(
    `INSERT INTO workflow_instances (id, workflow_name, marking, context_data, version, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateMarking = db.query<void, [string, string | null, string]>(
    `UPDATE workflow_instances SET marking = ?, version = ?, updated_at = unixepoch() WHERE id = ?`,
  );
  const updateFull = db.query<
    void,
    [string, string, string | null, string, string]
  >(
    `UPDATE workflow_instances SET marking = ?, context_data = ?, version = ?, status = ?, updated_at = unixepoch() WHERE id = ?`,
  );

  type TimeoutRow = {
    id: string;
    instance_id: string;
    transition_name: string;
    place: string;
    fire_at: number;
    fired: number;
  };

  const insertTimeout = db.query<void, [string, string, string, string, number]>(
    `INSERT INTO timeout_entries (id, instance_id, transition_name, place, fire_at)
     SELECT ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM timeout_entries WHERE instance_id = ?2 AND transition_name = ?3 AND fired = 0
     )`,
  );

  const selectExpired = db.query<TimeoutRow, [string, number]>(
    `SELECT * FROM timeout_entries WHERE instance_id = ? AND fired = 0 AND fire_at <= ?`,
  );

  const updateFired = db.query<void, [string]>(
    `UPDATE timeout_entries SET fired = 1 WHERE id = ?`,
  );

  const deleteTimeoutsForTransition = db.query<void, [string, string]>(
    `DELETE FROM timeout_entries WHERE instance_id = ? AND transition_name = ?`,
  );

  const deleteTimeoutsForInstance = db.query<void, [string]>(
    `DELETE FROM timeout_entries WHERE instance_id = ?`,
  );

  const selectPending = db.query<{ n: number }, [string]>(
    `SELECT COUNT(*) as n FROM timeout_entries WHERE instance_id = ? AND fired = 0`,
  );

  type HistoryRow = {
    id: number;
    instance_id: string;
    workflow_name: string;
    transition_name: string;
    marking_before: string;
    marking_after: string;
    context_after: string;
    fired_at: number;
  };

  const insertHistory = db.query<void, [string, string, string, string, string, string, number]>(
    `INSERT INTO transition_history (instance_id, workflow_name, transition_name, marking_before, marking_after, context_after, fired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const selectHistory = db.query<HistoryRow, [string]>(
    `SELECT * FROM transition_history WHERE instance_id = ? ORDER BY id ASC`,
  );

  return {
    async exists(id: string): Promise<boolean> {
      return selectOne.get(id) !== null;
    },

    async load(id: string): Promise<InstanceState<Place>> {
      const row = selectOne.get(id);
      if (!row) throw new Error(`Instance not found: ${id}`);
      return {
        marking: JSON.parse(row.marking) as Marking<Place>,
        version: row.version ?? undefined,
      };
    },

    async save(id: string, state: InstanceState<Place>): Promise<void> {
      const existing = selectOne.get(id);
      if (existing) {
        updateMarking.run(
          JSON.stringify(state.marking),
          state.version ?? null,
          id,
        );
      } else {
        insertRow.run(
          id,
          workflowName,
          JSON.stringify(state.marking),
          "{}",
          state.version ?? null,
          "active",
        );
      }
    },

    async loadExtended(
      id: string,
    ): Promise<ExtendedInstanceState<Place, Ctx>> {
      const row = selectOne.get(id);
      if (!row) throw new Error(`Instance not found: ${id}`);
      return {
        marking: JSON.parse(row.marking) as Marking<Place>,
        version: row.version ?? undefined,
        workflowName: row.workflow_name,
        context: JSON.parse(row.context_data) as Ctx,
        status: row.status as WorkflowStatus,
      };
    },

    async saveExtended(
      id: string,
      state: ExtendedInstanceState<Place, Ctx>,
    ): Promise<void> {
      const existing = selectOne.get(id);
      if (existing) {
        updateFull.run(
          JSON.stringify(state.marking),
          JSON.stringify(state.context),
          state.version ?? null,
          state.status,
          id,
        );
      } else {
        insertRow.run(
          id,
          state.workflowName,
          JSON.stringify(state.marking),
          JSON.stringify(state.context),
          state.version ?? null,
          state.status,
        );
      }
    },

    async listActive(): Promise<string[]> {
      return selectActive.all(workflowName).map((r) => r.id);
    },

    async scheduleTimeout(entry: TimeoutEntry): Promise<void> {
      insertTimeout.run(entry.id, entry.instanceId, entry.transitionName, entry.place, entry.fireAt);
    },

    async getExpiredTimeouts(instanceId: string, now: number): Promise<TimeoutEntry[]> {
      return selectExpired.all(instanceId, now).map((r) => ({
        id: r.id,
        instanceId: r.instance_id,
        transitionName: r.transition_name,
        place: r.place,
        fireAt: r.fire_at,
      }));
    },

    async markTimeoutFired(id: string): Promise<void> {
      updateFired.run(id);
    },

    async clearTimeouts(instanceId: string, transitionName?: string): Promise<void> {
      if (transitionName) {
        deleteTimeoutsForTransition.run(instanceId, transitionName);
      } else {
        deleteTimeoutsForInstance.run(instanceId);
      }
    },

    async hasPendingTimeouts(instanceId: string): Promise<boolean> {
      const row = selectPending.get(instanceId);
      return (row?.n ?? 0) > 0;
    },

    async recordTransition(entry: Omit<HistoryEntry, "id">): Promise<void> {
      insertHistory.run(
        entry.instanceId,
        entry.workflowName,
        entry.transitionName,
        JSON.stringify(entry.markingBefore),
        JSON.stringify(entry.markingAfter),
        JSON.stringify(entry.contextAfter),
        entry.firedAt,
      );
    },

    async getHistory(instanceId: string): Promise<HistoryEntry[]> {
      return selectHistory.all(instanceId).map((r) => ({
        id: r.id,
        instanceId: r.instance_id,
        workflowName: r.workflow_name,
        transitionName: r.transition_name,
        markingBefore: JSON.parse(r.marking_before),
        markingAfter: JSON.parse(r.marking_after),
        contextAfter: JSON.parse(r.context_after),
        firedAt: r.fired_at,
      }));
    },
  };
}
