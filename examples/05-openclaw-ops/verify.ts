import { loadRules } from "@petriflow/rules";
import { analyse, reachableStates } from "petri-ts";
import { join } from "path";
import { deploymentPipelineNet } from "./deployment-pipeline.js";

const rulesPath = join(import.meta.dir, "ops-assistant.rules");
const { nets: ruleNets, verification } = await loadRules(rulesPath);

console.log(`Rules: ${ruleNets.length} nets from ops-assistant.rules`);

console.log("\nRule verification:");
for (const v of verification) {
  console.log(`  ${v.name}: ${v.reachableStates} reachable states`);
}

// Verify the deployment pipeline net separately
const pipelineNet = {
  places: deploymentPipelineNet.places,
  transitions: deploymentPipelineNet.transitions.map((t) => ({
    name: t.name,
    inputs: t.inputs,
    outputs: t.outputs,
  })),
  initialMarking: deploymentPipelineNet.initialMarking,
};

const pipelineAnalysis = analyse(pipelineNet, {
  invariants: [
    // Token conservation: exactly one token across all places at all times
    { weights: { idle: 1, building: 1, tested: 1, staged: 1, canary: 1 } },
  ],
});

const states = reachableStates(pipelineNet);

console.log(`\nDeployment pipeline: ${pipelineAnalysis.reachableStateCount} reachable states`);
console.log(`  Deadlock-free: ${pipelineAnalysis.isDeadlockFree}`);
console.log(`  Token conservation (1 token always): ${pipelineAnalysis.invariants[0]?.holds}`);
console.log(`  Terminal states: ${pipelineAnalysis.terminalStates.length}`);
console.log(`  States: ${states.map((s) => {
  const active = Object.entries(s).filter(([, v]) => v > 0).map(([k]) => k);
  return active.join("+") || "empty";
}).join(", ")}`);

// Combined stats
const allNets = [...ruleNets, deploymentPipelineNet];
const gatedTools = new Set<string>();
for (const net of allNets) {
  for (const t of net.transitions) {
    if ("tools" in t && t.tools) {
      for (const tool of t.tools) gatedTools.add(tool);
    }
  }
}

console.log(`\nTotal: ${allNets.length} nets, ${gatedTools.size} unique gated tools`);
console.log(`Gated tools: ${[...gatedTools].sort().join(", ")}`);
