/**
 * SQL schema for workflow persistence.
 * Using raw SQL with bun:sqlite for simplicity (drizzle migrations deferred).
 */

export const CREATE_WORKFLOW_INSTANCES = `
  CREATE TABLE IF NOT EXISTS workflow_instances (
    id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    marking TEXT NOT NULL,
    context_data TEXT NOT NULL DEFAULT '{}',
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`;

export const CREATE_TIMEOUT_ENTRIES = `
  CREATE TABLE IF NOT EXISTS timeout_entries (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
    transition_name TEXT NOT NULL,
    place TEXT NOT NULL,
    fire_at INTEGER NOT NULL,
    fired INTEGER NOT NULL DEFAULT 0
  )
`;
