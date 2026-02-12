import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "../types.js";
import type { ToolEvent } from "../types.js";

const places = ["idle", "working", "committed"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  working: 0,
  committed: 0,
};

/**
 * Maps bash tool calls to virtual tool names based on the command.
 * "git commit ..." → "git-commit"
 * "git push ..."   → "git-push"
 * everything else  → "bash" (which is in freeTools)
 */
function mapTool(event: ToolEvent): string {
  if (event.toolName !== "bash") return event.toolName;
  const cmd = (event.input as { command?: string }).command ?? "";
  if (/\bgit\s+(commit|merge)\b/.test(cmd)) return "git-commit";
  if (/\bgit\s+push\b/.test(cmd)) return "git-push";
  return "bash";
}

/**
 * Implement skill net — autonomous coding with gated commits.
 *
 * The agent works freely: reads, writes, edits, runs tests, installs
 * packages, does whatever it needs. No per-tool approval friction.
 *
 * The only gates are irreversible actions:
 * - git commit: human reviews the diff before it's committed
 * - git push: human approves before code leaves the machine
 *
 * After push, the token returns to `working` so the agent can
 * continue with the next task.
 *
 * Flow:  idle → working ←→ committed
 *              (commit)↗   ↘(push)
 */
export const implementNet = defineSkillNet<Place>({
  name: "implement",
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
      outputs: ["working"],
    },
    {
      name: "commitCode",
      type: "manual",
      inputs: ["working"],
      outputs: ["committed"],
      tools: ["git-commit"],
    },
    {
      name: "pushCode",
      type: "manual",
      inputs: ["committed"],
      outputs: ["working"],
      tools: ["git-push"],
    },
  ],
});
