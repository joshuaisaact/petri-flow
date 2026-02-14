import { defineSkillNet } from "@petriflow/gate";

type Place = "idle" | "ready" | "locked";

/**
 * Default safety net for Claude Code.
 *
 * - FREE (read-only, no side effects): Read, Glob, Grep, WebSearch
 * - GATED (allowed via ready): Write, Edit, WebFetch, Task
 * - BLOCKED (locked place, 0 tokens): Bash
 */
export const safeCodingNet = defineSkillNet<Place>({
  name: "safe-coding",
  places: ["idle", "ready", "locked"],
  terminalPlaces: [],
  freeTools: ["Read", "Glob", "Grep", "WebSearch"],
  initialMarking: { idle: 1, ready: 0, locked: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    // Gated tools — consume and restore ready token
    { name: "writeFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Write"] },
    { name: "editFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Edit"] },
    { name: "webFetch", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["WebFetch"] },
    { name: "spawnTask", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Task"] },
    // Blocked — locked has 0 tokens, never fires
    { name: "bashBlocked", type: "auto", inputs: ["locked"], outputs: ["locked"], tools: ["Bash"] },
  ],
});
