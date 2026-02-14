import { defineSkillNet } from "@petriflow/gate";

/**
 * Tool-approval net for OpenClaw.
 *
 * OpenClaw tool names: exec, read, write, web_fetch, web_search,
 * browser, message, image, canvas, cron, gateway, tts, nodes,
 * memory_search, memory_get, sessions_send, sessions_list,
 * sessions_spawn, sessions_history, session_status, agents_list.
 *
 * - `read` is free (read-only, no side effects)
 * - `exec` and `write` are gated (can mutate state)
 *
 * Auto-advances idle → ready. Gated transitions are `auto` (not manual)
 * because OpenClaw hooks run with hasUI: false — manual transitions
 * would always be denied.
 */
export const openclawToolApprovalNet = defineSkillNet({
  name: "openclaw-tool-approval",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["read", "web_fetch", "web_search", "memory_search", "memory_get"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "execShell", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["exec"] },
    { name: "writeFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["write"] },
    { name: "sendMessage", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["message"] },
    { name: "useBrowser", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["browser"] },
  ],
});
