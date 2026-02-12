import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createPetriGate } from "../../packages/pi-assistant/src/index.js";
import { communicateNet } from "../../packages/pi-assistant/src/nets/communicate.js";
import { deployNet } from "../../packages/pi-assistant/src/nets/deploy.js";
import { researchNet } from "../../packages/pi-assistant/src/nets/research.js";
import { cleanupNet } from "../../packages/pi-assistant/src/nets/cleanup.js";

const nets = { communicate: communicateNet, deploy: deployNet, research: researchNet, cleanup: cleanupNet };
type NetName = keyof typeof nets;

export default function (pi: ExtensionAPI) {
  let activeGate: ((pi: ExtensionAPI) => void) | null = null;
  let activeName: string | null = null;

  // Default: communicate (safe messaging for a personal assistant)
  activeName = "communicate";
  activeGate = createPetriGate(nets[activeName]);
  activeGate(pi);

  // /use-net <name> command to switch active net
  pi.registerCommand("use-net", {
    description: "Switch active Petri net: communicate, deploy, research, cleanup",
    handler: async (args, ctx) => {
      const name = (args ?? "").trim() as NetName;
      if (!(name in nets)) {
        ctx.ui.notify(`Unknown net: ${name}. Available: ${Object.keys(nets).join(", ")}`);
        return;
      }
      activeName = name;
      ctx.ui.notify(`Switched to '${name}' net. Restart conversation to activate.`);
    },
  });
}
