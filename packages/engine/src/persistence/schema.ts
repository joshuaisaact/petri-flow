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

export const CREATE_TRANSITION_HISTORY = `
  CREATE TABLE IF NOT EXISTS transition_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
    workflow_name TEXT NOT NULL,
    transition_name TEXT NOT NULL,
    marking_before TEXT NOT NULL,
    marking_after TEXT NOT NULL,
    context_after TEXT NOT NULL DEFAULT '{}',
    fired_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
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
