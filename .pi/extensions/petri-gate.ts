import { composeGates } from "../../packages/pi-extension/src/index.js";
import { communicateNet } from "../../packages/pi-assistant/src/nets/communicate.js";
import { deployNet } from "../../packages/pi-assistant/src/nets/deploy.js";
import { researchNet } from "../../packages/pi-assistant/src/nets/research.js";
import { cleanupNet } from "../../packages/pi-assistant/src/nets/cleanup.js";

export default composeGates({
  registry: {
    communicate: communicateNet,
    deploy: deployNet,
    research: researchNet,
    cleanup: cleanupNet,
  },
});
