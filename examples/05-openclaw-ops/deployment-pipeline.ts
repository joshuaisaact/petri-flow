import { defineSkillNet } from "@petriflow/gate";

/**
 * Deployment pipeline as a Petri net workflow.
 *
 * This is NOT an if/then rule — it's a stateful workflow with:
 *   - A single deploy-slot TOKEN (concurrent resource contention)
 *   - Branching: promote OR rollback, both restore the token
 *   - Deferred transitions: net only advances on successful tool_result
 *
 * The agent is free to do ANYTHING between transitions — read files,
 * search the web, debug, fix code. The net only constrains the
 * deployment-specific actions, not the agent's reasoning.
 *
 *        ┌──────────────────────────────────────────────────┐
 *        │                                                  │
 *        ▼                                                  │
 *     [idle:1] ──build──▶ [building] ──test──▶ [tested]     │
 *                                                │          │
 *                                              stage        │
 *                                                │          │
 *                                                ▼          │
 *                                             [staged] ─────┤ rollback
 *                                                │          │
 *                                              canary       │
 *                                                │          │
 *                                                ▼          │
 *                                             [canary] ─────┤ rollback
 *                                                │          │
 *                                             promote       │
 *                                                │          │
 *                                                └──────────┘
 *
 * Key properties (formally verified):
 *   - Mutual exclusion: only one deployment at a time
 *   - Liveness: every state can reach idle (promote or rollback)
 *   - Conservation: the deploy-slot token is always preserved
 */

type Place = "idle" | "building" | "tested" | "staged" | "canary";

export const deploymentPipelineNet = defineSkillNet<Place>({
  name: "deployment-pipeline",
  places: ["idle", "building", "tested", "staged", "canary"],
  terminalPlaces: [],
  freeTools: [],
  initialMarking: { idle: 1, building: 0, tested: 0, staged: 0, canary: 0 },

  transitions: [
    // Build — consumes the deploy slot
    {
      name: "build",
      type: "auto",
      inputs: ["idle"],
      outputs: ["building"],
      tools: ["deploy-build"],
      deferred: true,
    },
    // Test — requires successful build
    {
      name: "test",
      type: "auto",
      inputs: ["building"],
      outputs: ["tested"],
      tools: ["deploy-test"],
      deferred: true,
    },
    // Stage — requires passing tests
    {
      name: "stage",
      type: "auto",
      inputs: ["tested"],
      outputs: ["staged"],
      tools: ["deploy-stage"],
      deferred: true,
    },
    // Canary — requires successful staging
    {
      name: "canary",
      type: "auto",
      inputs: ["staged"],
      outputs: ["canary"],
      tools: ["deploy-canary"],
      deferred: true,
    },
    // Promote — restores deploy slot (happy path)
    {
      name: "promote",
      type: "auto",
      inputs: ["canary"],
      outputs: ["idle"],
      tools: ["deploy-promote"],
      deferred: true,
    },
    // Rollback from canary — restores deploy slot
    {
      name: "rollback-canary",
      type: "auto",
      inputs: ["canary"],
      outputs: ["idle"],
      tools: ["deploy-rollback"],
      deferred: true,
    },
    // Rollback from staging — restores deploy slot
    {
      name: "rollback-staging",
      type: "auto",
      inputs: ["staged"],
      outputs: ["idle"],
      tools: ["deploy-rollback"],
      deferred: true,
    },
  ],

  // Map exec/process commands to deployment actions
  toolMapper(event) {
    if (event.toolName !== "exec" && event.toolName !== "process") {
      return event.toolName;
    }
    const cmd = (event.input?.command as string) ?? "";
    if (/\bdeploy\s+build\b/.test(cmd)) return "deploy-build";
    if (/\bdeploy\s+test\b/.test(cmd)) return "deploy-test";
    if (/\bdeploy\s+stage\b/.test(cmd)) return "deploy-stage";
    if (/\bdeploy\s+canary\b/.test(cmd)) return "deploy-canary";
    if (/\bdeploy\s+promote\b/.test(cmd)) return "deploy-promote";
    if (/\bdeploy\s+rollback\b/.test(cmd)) return "deploy-rollback";
    return event.toolName;
  },
});
