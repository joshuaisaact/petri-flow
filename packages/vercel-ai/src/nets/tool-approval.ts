import { defineSkillNet } from "@petriflow/gate";

/**
 * Generic tool-approval net for Vercel AI SDK integrations.
 *
 * - readData, fetchData are free (read-only, no side effects)
 * - writeData, sendEmail are gated (can mutate state)
 *
 * Auto-advances idle → ready. Gated transitions are `auto`
 * so they pass without manual confirmation.
 */
export const vercelAiToolApprovalNet = defineSkillNet({
  name: "vercel-ai-tool-approval",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["readData", "fetchData"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "writeData", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["writeData"] },
    { name: "sendEmail", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["sendEmail"] },
  ],
});
