/**
 * OpenClaw plugin entry point.
 *
 * Composes two layers:
 *   1. Rules-compiled nets (56 simple gates — blocks, sequences, limits)
 *   2. Hand-crafted workflow nets (deployment pipeline — stateful, branching)
 *
 * Both compose via AND-logic: every tool call must be allowed by ALL nets.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { compile } from "@petriflow/rules";
import { createPetriGatePlugin } from "./src/index.js";
import { deploymentPipelineNet } from "../../examples/05-openclaw-ops/deployment-pipeline.js";

// jiti compiles ESM → CJS, so __dirname is available at runtime
declare const __dirname: string;
const rulesPath = resolve(__dirname, "../../examples/05-openclaw-ops/ops-assistant.rules");
const rulesText = readFileSync(rulesPath, "utf-8");
const { nets: ruleNets } = compile(rulesText);

const allNets = [...ruleNets, deploymentPipelineNet];
console.error(`[petriflow-gate] loaded ${allNets.length} nets (${ruleNets.length} rules + 1 workflow)`);

export default createPetriGatePlugin(allNets, {
  mode: "enforce",
  onDecision: (event, decision) => {
    const action = decision?.block ? `BLOCKED: ${decision.reason}` : "allow";
    console.error(`[petriflow-gate] ${event.toolName} → ${action}`);
  },
});
