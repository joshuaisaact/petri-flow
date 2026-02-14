import { defineSkillNet } from "@petriflow/gate";

/**
 * WhatsApp safety net for OpenClaw.
 *
 * Structurally enforces restrictions on dangerous tools that cannot be
 * bypassed via prompt injection or jailbreak attempts.
 *
 * - BLOCKED: `exec` and `sessions_send` require tokens from `locked` (always 0)
 *   — no transition can ever fire, so these tools are permanently denied.
 * - GATED: `write`, `message`, `browser` are allowed via `ready` transitions.
 * - FREE: `read`, `web_fetch`, `web_search`, `memory_search`, `memory_get`
 *   bypass the net entirely.
 */
export const whatsappSafetyNet = defineSkillNet({
  name: "whatsapp-safety",
  places: ["idle", "ready", "locked"],
  terminalPlaces: [],
  freeTools: ["read", "web_fetch", "web_search", "memory_search", "memory_get"],
  initialMarking: { idle: 1, ready: 0, locked: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    // Allowed tools — consume and restore a ready token
    { name: "writeFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["write"] },
    { name: "sendMessage", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["message"] },
    { name: "useBrowser", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["browser"] },
    // Permanently blocked — locked has 0 tokens, these transitions can never fire
    { name: "execBlocked", type: "auto", inputs: ["locked"], outputs: ["locked"], tools: ["exec"] },
    { name: "sessionsSendBlocked", type: "auto", inputs: ["locked"], outputs: ["locked"], tools: ["sessions_send"] },
  ],
});
