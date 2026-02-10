import type { Database } from "bun:sqlite";
import type { WorkflowDefinition } from "../types.js";

/**
 * Serializable workflow definition — pure data, no functions.
 * This is what goes into the database and comes out of the API.
 * Pass it to defineWorkflow() to get a runnable WorkflowDefinition.
 */
export type SerializedDefinition = {
  name: string;
  places: string[];
  transitions: Array<{
    name: string;
    type: string;
    inputs: string[];
    outputs: string[];
    guard: string | null;
    timeout?: { place: string; ms: number };
    config?: Record<string, unknown>;
  }>;
  initialMarking: Record<string, number>;
  initialContext: Record<string, unknown>;
  terminalPlaces: string[];
  invariants?: Array<{ weights: Record<string, number> }>;
};

export type DefinitionStore = {
  save(def: SerializedDefinition): void;
  load(name: string): SerializedDefinition | null;
  list(): string[];
  delete(name: string): boolean;
};

export const CREATE_WORKFLOW_DEFINITIONS = `
  CREATE TABLE IF NOT EXISTS workflow_definitions (
    name TEXT PRIMARY KEY,
    definition TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

export function createDefinitionStore(db: Database): DefinitionStore {
  db.run(CREATE_WORKFLOW_DEFINITIONS);

  const upsert = db.prepare(
    `INSERT INTO workflow_definitions (name, definition, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at`,
  );
  const select = db.prepare("SELECT definition FROM workflow_definitions WHERE name = ?");
  const selectAll = db.prepare("SELECT name FROM workflow_definitions ORDER BY name");
  const remove = db.prepare("DELETE FROM workflow_definitions WHERE name = ?");

  return {
    save(def) {
      const now = Date.now();
      upsert.run(def.name, JSON.stringify(def), now, now);
    },

    load(name) {
      const row = select.get(name) as { definition: string } | null;
      if (!row) return null;
      return JSON.parse(row.definition);
    },

    list() {
      return (selectAll.all() as { name: string }[]).map((r) => r.name);
    },

    delete(name) {
      return remove.run(name).changes > 0;
    },
  };
}

/**
 * Extract the serializable parts of a WorkflowDefinition.
 * The inverse is defineWorkflow(serialized) — which recompiles
 * guards and validates places.
 */
export function serializeDefinition<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(def: WorkflowDefinition<Place, Ctx>): SerializedDefinition {
  return {
    name: def.name,
    places: Object.keys(def.net.initialMarking),
    transitions: def.net.transitions.map((t) => ({
      name: t.name,
      type: t.type,
      inputs: [...t.inputs],
      outputs: [...t.outputs],
      guard: t.guard,
      ...(t.timeout && { timeout: t.timeout }),
      ...(t.config && { config: t.config }),
    })),
    initialMarking: def.net.initialMarking,
    initialContext: def.initialContext as Record<string, unknown>,
    terminalPlaces: [...def.terminalPlaces],
    ...(def.invariants && { invariants: def.invariants as Array<{ weights: Record<string, number> }> }),
  };
}
