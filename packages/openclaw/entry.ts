/**
 * OpenClaw plugin entry point.
 *
 * Loads petriflow-gate in enforce mode with the WhatsApp safety net.
 * Enforce mode blocks dangerous tools structurally — no prompt injection
 * can bypass Petri net token requirements.
 */
import { createPetriGatePlugin } from "./src/index.js";
import { whatsappSafetyNet } from "./src/nets/whatsapp-safety.js";

export default createPetriGatePlugin([whatsappSafetyNet], {
  mode: "enforce",
  onDecision: (event, decision) => {
    const action = decision?.block ? `BLOCKED: ${decision.reason}` : "allow";
    console.error(`[petriflow-gate] ${event.toolName} → ${action}`);
  },
});
