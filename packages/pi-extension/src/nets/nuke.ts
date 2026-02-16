import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";
import type { ToolEvent } from "@petriflow/gate";
import { normalize } from "node:path";

// -----------------------------------------------------------------------
// Path extraction
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
  // truncate
  [/\bTRUNCATE\b/i, () => "database"],
];

/** Extract what a command backs up, or null if not a backup command */
export function extractBackupTarget(command: string): string | null {
  for (const [pattern, extract] of BACKUP_PATTERNS) {
    const m = command.match(pattern);
    if (m) return normalizePath(extract(m));
  }
  return null;
}

/** Extract what a command destroys, or null if not destructive */
export function extractDestructiveTarget(command: string): string | null {
  for (const [pattern, extract] of DESTRUCTIVE_PATTERNS) {
    const m = command.match(pattern);
    if (m) return normalizePath(extract(m));
  }
  return null;
}

function normalizePath(p: string): string {
  // Special targets like "database" stay as-is
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
  // Check if target is a child of backedUp
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
 * Nuke skill net — destructive operations with guaranteed backup.
 *
 * All tools are free EXCEPT destructive bash commands, which require
 * a successful backup to have been run first. The backup must cover
 * the path being destroyed.
 *
 * Flow:
 *   idle → ready (auto-advance)
 *   ready → [backup command, deferred] → backedUp
 *   backedUp → [destructive command] → ready
 *
 * The backup transition is deferred: it only fires when the backup
 * command succeeds (exit code 0). A failed backup doesn't count.
 *
 * Path tracking via meta.backedUpPaths ensures the backup covers
 * what's being destroyed.
 */
export const nukeNet = defineSkillNet<Place>({
  name: "nuke",
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

  // After a successful backup, record what was backed up
  onDeferredResult(event, _resolvedTool, _transition, state) {
    const cmd = (event.input as { command?: string }).command ?? "";
    const target = extractBackupTarget(cmd);
    if (target) {
      const entries = (state.meta.backedUpPaths as BackedUpEntry[] | undefined) ?? [];
      entries.push({ path: target, command: cmd });
      state.meta.backedUpPaths = entries;
    }
  },

  // Before allowing a destructive command, check path coverage
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
