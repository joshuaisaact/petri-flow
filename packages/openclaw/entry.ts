/**
 * OpenClaw plugin entry point.
 *
 * Loads petriflow-gate in shadow mode with the tool-approval net.
 * Shadow mode logs every gating decision but never blocks — safe for evaluation.
 *
 * To switch to enforce mode, change mode: "shadow" → mode: "enforce".
 */
import { createPetriGatePlugin } from "./src/index.js";
import { openclawToolApprovalNet } from "./src/nets/tool-approval.js";

export default createPetriGatePlugin([openclawToolApprovalNet], {
  mode: "shadow",
  onDecision: (event, decision) => {
    const action = decision?.block ? `WOULD_BLOCK: ${decision.reason}` : "allow";
    console.error(`[petriflow-gate] ${event.toolName} → ${action}`);
  },
});
