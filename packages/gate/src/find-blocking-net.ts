import type { GateManager } from "./manager.js";

/** Best-effort: find which active net has jurisdiction over this tool. */
export function findBlockingNet(manager: GateManager, toolName: string): string {
  const activeNets = manager.getActiveNets();
  for (const { name, net } of activeNets) {
    const hasJurisdiction = net.transitions.some((t) => t.tools?.includes(toolName));
    if (hasJurisdiction) return name;
  }
  return activeNets[0]?.name ?? "petriflow";
}
