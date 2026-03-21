import type { GateManager } from "./manager.js";
import { classifyNets } from "./compose.js";

/** Find the name of the net that actually blocked a tool call. */
export function findBlockingNet(manager: GateManager, toolName: string): string {
  const activeNets = manager.getActiveNets();
  const nets = activeNets.map((n) => n.net);
  const states = activeNets.map((n) => n.state);

  const verdicts = classifyNets(nets, states, { toolName, input: {} });

  for (let i = 0; i < verdicts.length; i++) {
    if (verdicts[i]!.kind === "blocked") {
      return activeNets[i]!.name;
    }
  }

  // Fallback: no net classified as blocked (shouldn't happen if called after a block decision)
  return activeNets[0]?.name ?? "petriflow";
}
