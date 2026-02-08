import { Database } from "bun:sqlite";
import type { PersistenceAdapter, InstanceState, Marking } from "petri-ts";
import type { WorkflowStatus } from "../types.js";
import { CREATE_WORKFLOW_INSTANCES } from "./schema.js";

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
  loadExtended(id: string): Promise<ExtendedInstanceState<Place, Ctx>>;
  saveExtended(
    id: string,
    state: ExtendedInstanceState<Place, Ctx>,
  ): Promise<void>;
  listActive(): Promise<string[]>;
} {
  db.run(CREATE_WORKFLOW_INSTANCES);

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

  return {
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
  };
}
