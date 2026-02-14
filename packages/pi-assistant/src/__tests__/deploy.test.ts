import { describe, test, expect } from "bun:test";
import { deployNet } from "../nets/deploy.js";
import {
  handleToolCall,
  handleToolResult,
  createGateState,
  autoAdvance,
} from "@petriflow/gate";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

type Place = "idle" | "ready" | "staged";

function gs() {
  return createGateState<Place>(autoAdvance(deployNet, { ...deployNet.initialMarking }));
}

const noCtx = { hasUI: false } as any;
const uiCtx = {
  hasUI: true,
  confirm: async () => true,
} as any;

function bash(command: string, toolCallId = "tc-1") {
  return { toolCallId, toolName: "bash", input: { command } } as any;
}

function bashResult(toolCallId: string, isError: boolean) {
  return { toolCallId, toolName: "bash", input: {}, isError } as any;
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("deployNet", () => {
  test("auto-advances from idle to ready", () => {
    const state = gs();
    expect(state.marking.ready).toBe(1);
    expect(state.marking.idle).toBe(0);
  });

  test("regular bash is free", async () => {
    const state = gs();
    const result = await handleToolCall(
      bash("echo hello"),
      noCtx,
      deployNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("rollback is free", async () => {
    const state = gs();
    const result = await handleToolCall(
      bash("rollback production"),
      noCtx,
      deployNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("run-tests is deferred — allowed, tracked in meta on success", async () => {
    const state = gs();
    const result = await handleToolCall(
      bash("bun test", "tc-test"),
      noCtx,
      deployNet,
      state,
    );
    expect(result).toBeUndefined();
    expect(state.meta.testsPassed).toBeUndefined();

    handleToolResult(bashResult("tc-test", false), deployNet, state);
    expect(state.meta.testsPassed).toBe(true);
    expect(state.marking.ready).toBe(1); // self-loop
  });

  test("failed test run doesn't set testsPassed", async () => {
    const state = gs();
    await handleToolCall(bash("npm test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", true), deployNet, state);
    expect(state.meta.testsPassed).toBeUndefined();
  });

  test("deploy-staging blocked without passing tests", async () => {
    const state = gs();
    const result = await handleToolCall(
      bash("deploy to staging", "tc-deploy"),
      noCtx,
      deployNet,
      state,
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("tests");
  });

  test("deploy-staging allowed after tests pass", async () => {
    const state = gs();

    // Run tests
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);

    // Deploy staging
    const result = await handleToolCall(
      bash("deploy to staging preview", "tc-stage"),
      noCtx,
      deployNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("staging deploy advances to staged state on success", async () => {
    const state = gs();

    // Tests
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);

    // Stage
    await handleToolCall(bash("deploy to staging", "tc-stage"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-stage", false), deployNet, state);

    expect(state.marking.staged).toBe(1);
    expect(state.marking.ready).toBe(0);
  });

  test("deploy-prod requires manual approval", async () => {
    const state = gs();

    // Get to staged
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);
    await handleToolCall(bash("deploy to staging", "tc-stage"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-stage", false), deployNet, state);

    // Prod without UI → blocked
    const result = await handleToolCall(
      bash("deploy to production", "tc-prod"),
      noCtx,
      deployNet,
      state,
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("UI");
  });

  test("deploy-prod succeeds with UI approval", async () => {
    const state = gs();

    // Get to staged
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);
    await handleToolCall(bash("deploy to staging", "tc-stage"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-stage", false), deployNet, state);

    // Prod with UI → allowed
    const result = await handleToolCall(
      bash("deploy to production", "tc-prod"),
      uiCtx,
      deployNet,
      state,
    );
    expect(result).toBeUndefined();
    // Cycles back to ready
    expect(state.marking.ready).toBe(1);
    expect(state.marking.staged).toBe(0);
  });

  test("full pipeline: test → build → stage → prod", async () => {
    const state = gs();

    // Test
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);
    expect(state.meta.testsPassed).toBe(true);

    // Build
    await handleToolCall(bash("bun build src/index.ts", "tc-build"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-build", false), deployNet, state);
    expect(state.meta.buildSucceeded).toBe(true);

    // Stage
    await handleToolCall(bash("deploy to staging", "tc-stage"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-stage", false), deployNet, state);
    expect(state.marking.staged).toBe(1);

    // Prod
    await handleToolCall(bash("deploy to production", "tc-prod"), uiCtx, deployNet, state);
    expect(state.marking.ready).toBe(1);
  });

  test("staging resets test/build tracking for next cycle", async () => {
    const state = gs();

    // First cycle
    await handleToolCall(bash("bun test", "tc-test"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-test", false), deployNet, state);
    await handleToolCall(bash("deploy to staging", "tc-stage"), noCtx, deployNet, state);
    handleToolResult(bashResult("tc-stage", false), deployNet, state);

    // After staging, test tracking is reset
    expect(state.meta.testsPassed).toBe(false);

    // Go back to ready for next cycle (deploy-prod)
    await handleToolCall(bash("deploy to production", "tc-prod"), uiCtx, deployNet, state);

    // Must test again for next staging
    const result = await handleToolCall(
      bash("deploy to staging again", "tc-stage2"),
      noCtx,
      deployNet,
      state,
    );
    expect(result?.block).toBe(true);
  });
});
