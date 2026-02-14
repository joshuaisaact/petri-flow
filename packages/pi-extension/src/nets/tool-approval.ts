import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";

const places = ["idle", "ready"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  ready: 0,
};

/**
 * Tool-approval net for pi-mono:
 *
 * - read, grep, find, ls are free (observational, no side effects)
 * - bash requires manual approval each time (confirmation dialog)
 * - write/edit require manual approval each time
 *
 * Auto-advances idle → ready. The manual transitions consume and
 * reproduce the `ready` token, so the cycle repeats on every call.
 */
export const toolApprovalNet = defineSkillNet<Place>({
  name: "tool-approval",
  places: [...places],
  terminalPlaces: [],
  freeTools: ["ls", "read", "grep", "find"],
  initialMarking,
  transitions: [
    {
      name: "start",
      type: "auto",
      inputs: ["idle"],
      outputs: ["ready"],
    },
    {
      name: "execShell",
      type: "manual",
      inputs: ["ready"],
      outputs: ["ready"],
      tools: ["bash"],
    },
    {
      name: "execWrite",
      type: "manual",
      inputs: ["ready"],
      outputs: ["ready"],
      tools: ["write", "edit"],
    },
  ],
});
