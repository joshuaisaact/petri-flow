import { defineSkillNet } from "@petriflow/gate";

type Place = "idle" | "ready" | "locked";

/**
 * Default safety net for Claude Agent SDK.
 *
 * - FREE (read-only, no side effects): Read, Glob, Grep, WebSearch
 * - GATED (allowed via ready): Write, Edit, Bash, WebFetch, Agent
 * - BLOCKED: none by default (override with your own nets)
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
    { name: "runBash", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Bash"] },
    { name: "webFetch", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["WebFetch"] },
    { name: "spawnAgent", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Agent"] },
  ],
});
