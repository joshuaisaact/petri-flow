import { cleanupNet } from "@petriflow/pi-assistant";
import { communicateNet } from "@petriflow/pi-assistant";
import { deployNet } from "@petriflow/pi-assistant";
import { researchNet } from "@petriflow/pi-assistant";

/** Backup-before-destroy safety net. */
export function backupBeforeDelete() {
  return cleanupNet;
}

/** Observe-before-send safety net. */
export function observeBeforeSend() {
  return communicateNet;
}

/** Test-before-deploy pipeline net. */
export function testBeforeDeploy() {
  return deployNet;
}

/** Research-before-share safety net. */
export function researchBeforeShare() {
  return researchNet;
}
