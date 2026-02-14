import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";
import type { ToolEvent } from "@petriflow/gate";
import { normalize } from "node:path";

// -----------------------------------------------------------------------
// Path / target extraction
// -----------------------------------------------------------------------

const BACKUP_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  // git stash → covers entire worktree
  [/\bgit\s+stash\b/, () => "."],
  // cp -r <src> <dest> → covers <src>
  [/\bcp\s+(?:-\w+\s+)*(.+?)\s+\S+\s*$/, (m) => m[1]!.trim()],
  // tar czf <archive> <src...> → covers first <src>
  [/\btar\s+\S*[cC]\S*\s+\S+\s+(.+)/, (m) => m[1]!.trim().split(/\s+/)[0]!],
  // pg_dump → covers "database"
  [/\bpg_dump\b/, () => "database"],
  // mysqldump → covers "database"
  [/\bmysqldump\b/, () => "database"],
  // rsync <src> <dest> → covers <src>
  [/\brsync\s+(?:-\w+\s+)*(.+?)\s+\S+\s*$/, (m) => m[1]!.trim()],
];

const DESTRUCTIVE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  // rm -rf <path>
  [/\brm\s+(?:-\w+\s+)*(.+)/, (m) => m[1]!.trim().split(/\s+/)[0]!],
  // git reset --hard → entire worktree
  [/\bgit\s+reset\s+--hard\b/, () => "."],
  // git clean → entire worktree
  [/\bgit\s+clean\b/, () => "."],
  // git checkout . → entire worktree
  [/\bgit\s+checkout\s+\.\s*$/, () => "."],
  // DROP TABLE / DROP DATABASE
  [/\bDROP\s+(TABLE|DATABASE)\b/i, () => "database"],
  // TRUNCATE
  [/\bTRUNCATE\b/i, () => "database"],
];

export function extractBackupTarget(command: string): string | null {
  for (const [pattern, extract] of BACKUP_PATTERNS) {
    const m = command.match(pattern);
    if (m) return normalizePath(extract(m));
  }
  return null;
}

export function extractDestructiveTarget(command: string): string | null {
  for (const [pattern, extract] of DESTRUCTIVE_PATTERNS) {
    const m = command.match(pattern);
    if (m) return normalizePath(extract(m));
  }
  return null;
}

function normalizePath(p: string): string {
  if (p === "database" || p === ".") return p;
  return normalize(p).replace(/\/+$/, "");
}

/**
 * Check if a backed-up path covers a destructive target.
 * "." covers everything. A parent path covers its children.
 */
export function pathCovers(backedUp: string, target: string): boolean {
  if (backedUp === ".") return true;
  if (backedUp === target) return true;
  const backedNorm = backedUp.endsWith("/") ? backedUp : backedUp + "/";
  return target.startsWith(backedNorm);
}

// -----------------------------------------------------------------------
// Net definition
// -----------------------------------------------------------------------

const places = ["idle", "ready", "backedUp"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  ready: 0,
  backedUp: 0,
};

type BackedUpEntry = { path: string; command: string };

function mapTool(event: ToolEvent): string {
  if (event.toolName !== "bash") return event.toolName;
  const cmd = (event.input as { command?: string }).command ?? "";
  if (extractBackupTarget(cmd) !== null) return "backup";
  if (extractDestructiveTarget(cmd) !== null) return "destructive";
  return "bash";
}

/**
 * Cleanup skill net — backup-before-destroy with zero human approval.
 *
 * Safety property: Every destructive command (rm, git reset --hard,
 * DROP TABLE, etc.) is physically blocked until a successful backup
 * exists that covers the same path. The backup must actually succeed
 * (deferred transition, checked on tool_result). Each destroy
 * consumes its backup — back up again before the next one.
 *
 * Flow:
 *   idle → ready (auto)
 *   ready → [backup, deferred] → backedUp
 *   backedUp → [destructive] → ready
 *
 * Path matching ensures the backup covers what's being destroyed:
 *   - `git stash` covers everything (".")
 *   - `cp -r src/ /tmp/src-bak` covers "src/" and children
 *   - `pg_dump` covers "database"
 *
 * Free tools: ls, read, grep, find, write, edit, bash (non-destructive)
 */
export const cleanupNet = defineSkillNet<Place>({
  name: "cleanup",
  places: [...places],
  terminalPlaces: [],
  freeTools: ["ls", "read", "grep", "find", "write", "edit", "bash"],
  initialMarking,
  toolMapper: mapTool,

  transitions: [
    {
      name: "start",
      type: "auto",
      inputs: ["idle"],
      outputs: ["ready"],
    },
    {
      name: "backup",
      type: "auto",
      inputs: ["ready"],
      outputs: ["backedUp"],
      tools: ["backup"],
      deferred: true,
    },
    {
      name: "destroy",
      type: "auto",
      inputs: ["backedUp"],
      outputs: ["ready"],
      tools: ["destructive"],
    },
  ],

  onDeferredResult(event, _resolvedTool, _transition, state) {
    const cmd = (event.input as { command?: string }).command ?? "";
    const target = extractBackupTarget(cmd);
    if (target) {
      const entries = (state.meta.backedUpPaths as BackedUpEntry[] | undefined) ?? [];
      entries.push({ path: target, command: cmd });
      state.meta.backedUpPaths = entries;
    }
  },

  validateToolCall(event, resolvedTool, _transition, state) {
    if (resolvedTool !== "destructive") return;

    const cmd = (event.input as { command?: string }).command ?? "";
    const target = extractDestructiveTarget(cmd);
    if (!target) return;

    const entries = (state.meta.backedUpPaths as BackedUpEntry[] | undefined) ?? [];
    const covered = entries.some((e) => pathCovers(e.path, target));

    if (!covered) {
      return {
        block: true,
        reason: `Destructive target '${target}' not covered by any backup. Backed up: [${entries.map((e) => e.path).join(", ") || "nothing"}]`,
      };
    }

    // Consume the matching backup entry
    const idx = entries.findIndex((e) => pathCovers(e.path, target));
    if (idx >= 0) entries.splice(idx, 1);
  },
});
