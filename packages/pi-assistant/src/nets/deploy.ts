import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";
import type { ToolEvent } from "@petriflow/gate";

// -----------------------------------------------------------------------
// Command classification
// -----------------------------------------------------------------------

const TEST_PATTERN = /\b(bun\s+test|npm\s+test|npx\s+jest|npx\s+vitest|pytest|cargo\s+test|go\s+test|make\s+test)\b/;
const BUILD_PATTERN = /\b(bun\s+build|npm\s+run\s+build|make(\s+build)?|cargo\s+build|go\s+build|docker\s+build)\b/;
const DEPLOY_STAGING_PATTERN = /\bdeploy\b.*\b(stag(?:ing)?|preprod|preview|dev)\b|\b(stag(?:ing)?|preprod|preview)\b.*\bdeploy\b/i;
const DEPLOY_PROD_PATTERN = /\bdeploy\b.*\b(prod(?:uction)?|release|live)\b|\b(prod(?:uction)?|release|live)\b.*\bdeploy\b/i;
const ROLLBACK_PATTERN = /\b(rollback|revert|undo.deploy)\b/i;

function mapTool(event: ToolEvent): string {
  if (event.toolName !== "bash") return event.toolName;

  const cmd = (event.input as { command?: string }).command ?? "";

  if (DEPLOY_PROD_PATTERN.test(cmd)) return "deploy-prod";
  if (DEPLOY_STAGING_PATTERN.test(cmd)) return "deploy-staging";
  if (ROLLBACK_PATTERN.test(cmd)) return "rollback";
  if (TEST_PATTERN.test(cmd)) return "run-tests";
  if (BUILD_PATTERN.test(cmd)) return "build";
  return "bash";
}

// -----------------------------------------------------------------------
// Net definition
// -----------------------------------------------------------------------

const places = ["idle", "ready", "staged"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  ready: 0,
  staged: 0,
};

/**
 * Deploy skill net — safe deployment pipeline.
 *
 * Safety properties:
 *   1. Cannot deploy to staging without a passing test run
 *   2. Cannot deploy to production without successful staging
 *   3. Production deploy requires human approval
 *   4. Rollback is always free (safety valve)
 *
 * Flow:
 *   idle → ready (auto)
 *   ready + [run-tests, deferred] → ready (self-loop, tracks success in meta)
 *   ready + [build, deferred] → ready (self-loop, tracks success in meta)
 *   ready + [deploy-staging, deferred] → staged (requires meta.testsPassed)
 *   staged + [deploy-prod, manual] → ready (human approves, cycles back)
 *
 * Free tools: bash, read, ls, grep, find, write, edit, rollback
 * Test/build are gated only to track their success — they always proceed.
 */
export const deployNet = defineSkillNet<Place>({
  name: "deploy",
  places: [...places],
  terminalPlaces: [],
  freeTools: ["read", "write", "edit", "ls", "grep", "find", "bash", "rollback"],
  initialMarking,
  toolMapper: mapTool,

  transitions: [
    {
      name: "start",
      type: "auto",
      inputs: ["idle"],
      outputs: ["ready"],
    },
    // Test: self-loop on ready. Deferred so we track pass/fail.
    {
      name: "test",
      type: "auto",
      inputs: ["ready"],
      outputs: ["ready"],
      tools: ["run-tests"],
      deferred: true,
    },
    // Build: self-loop on ready. Deferred so we track pass/fail.
    {
      name: "build",
      type: "auto",
      inputs: ["ready"],
      outputs: ["ready"],
      tools: ["build"],
      deferred: true,
    },
    // Deploy to staging: advances state. Requires tests passed.
    {
      name: "stage",
      type: "auto",
      inputs: ["ready"],
      outputs: ["staged"],
      tools: ["deploy-staging"],
      deferred: true,
    },
    // Deploy to production: requires human approval.
    {
      name: "ship",
      type: "manual",
      inputs: ["staged"],
      outputs: ["ready"],
      tools: ["deploy-prod"],
    },
  ],

  onDeferredResult(event, resolvedTool, _transition, state) {
    if (resolvedTool === "run-tests") {
      state.meta.testsPassed = true;
      state.meta.lastTestRun = Date.now();
    }
    if (resolvedTool === "build") {
      state.meta.buildSucceeded = true;
    }
    if (resolvedTool === "deploy-staging") {
      state.meta.stagingDeployed = true;
      // Reset test/build tracking for next cycle
      state.meta.testsPassed = false;
      state.meta.buildSucceeded = false;
    }
  },

  validateToolCall(_event, resolvedTool, _transition, state) {
    if (resolvedTool === "deploy-staging") {
      if (!state.meta.testsPassed) {
        return {
          block: true,
          reason: "Cannot deploy to staging without passing tests first. Run tests and ensure they pass.",
        };
      }
    }
  },
});
