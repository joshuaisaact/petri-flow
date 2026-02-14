import { describe, test, expect } from "bun:test";
import { researchNet } from "../nets/research.js";
import {
  handleToolCall,
  handleToolResult,
  createGateState,
  autoAdvance,
} from "@petriflow/gate";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

type Place = "idle" | "researching" | "canShare";

function gs() {
  return createGateState<Place>(autoAdvance(researchNet, { ...researchNet.initialMarking }));
}

const noCtx = { hasUI: false } as any;

function webFetch(url: string, toolCallId = "tc-1") {
  return {
    toolCallId,
    toolName: "bash",
    input: { command: `curl https://${url}` },
  } as any;
}

function slackSend(to: string, content: string, toolCallId = "tc-2") {
  return {
    toolCallId,
    toolName: "slack",
    input: { action: "sendMessage", to, content },
  } as any;
}

function bashResult(toolCallId: string, isError: boolean) {
  return { toolCallId, toolName: "bash", input: {}, isError } as any;
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("researchNet", () => {
  test("auto-advances from idle to researching", () => {
    const state = gs();
    expect(state.marking.researching).toBe(1);
    expect(state.marking.idle).toBe(0);
  });

  test("local tools are free", async () => {
    const state = gs();
    for (const tool of ["read", "write", "edit", "ls", "grep", "find"]) {
      const result = await handleToolCall(
        { toolCallId: `tc-${tool}`, toolName: tool, input: {} } as any,
        noCtx,
        researchNet,
        state,
      );
      expect(result).toBeUndefined();
    }
  });

  test("regular bash is free", async () => {
    const state = gs();
    const result = await handleToolCall(
      { toolCallId: "tc-1", toolName: "bash", input: { command: "echo hello" } } as any,
      noCtx,
      researchNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("share blocked without prior research", async () => {
    const state = gs();
    const result = await handleToolCall(
      slackSend("channel:C123", "here's what I found"),
      noCtx,
      researchNet,
      state,
    );
    expect(result?.block).toBe(true);
  });

  test("web-fetch is deferred — allowed, earns share token on success", async () => {
    const state = gs();
    const result = await handleToolCall(
      webFetch("example.com/api", "tc-fetch"),
      noCtx,
      researchNet,
      state,
    );
    expect(result).toBeUndefined();
    expect(state.marking.canShare).toBe(0); // not yet

    handleToolResult(bashResult("tc-fetch", false), researchNet, state);
    expect(state.marking.canShare).toBe(1);
    expect(state.marking.researching).toBe(1); // self-loop preserved
  });

  test("failed fetch doesn't earn share token", async () => {
    const state = gs();
    await handleToolCall(webFetch("example.com", "tc-fetch"), noCtx, researchNet, state);
    handleToolResult(bashResult("tc-fetch", true), researchNet, state);
    expect(state.marking.canShare).toBe(0);
  });

  test("share allowed after successful fetch", async () => {
    const state = gs();

    // Fetch
    await handleToolCall(webFetch("example.com", "tc-fetch"), noCtx, researchNet, state);
    handleToolResult(bashResult("tc-fetch", false), researchNet, state);

    // Share
    const result = await handleToolCall(
      slackSend("channel:C123", "findings", "tc-share"),
      noCtx,
      researchNet,
      state,
    );
    expect(result).toBeUndefined();
    expect(state.marking.canShare).toBe(0); // consumed
  });

  test("each share consumes one token — second share needs second fetch", async () => {
    const state = gs();

    // Fetch once
    await handleToolCall(webFetch("example.com", "tc-f1"), noCtx, researchNet, state);
    handleToolResult(bashResult("tc-f1", false), researchNet, state);

    // Share once — ok
    await handleToolCall(slackSend("channel:C123", "msg1", "tc-s1"), noCtx, researchNet, state);

    // Share again — blocked
    const result = await handleToolCall(
      slackSend("channel:C123", "msg2", "tc-s2"),
      noCtx,
      researchNet,
      state,
    );
    expect(result?.block).toBe(true);
  });

  test("multiple fetches accumulate share tokens", async () => {
    const state = gs();

    // Fetch 3 times
    for (let i = 0; i < 3; i++) {
      await handleToolCall(webFetch(`example.com/${i}`, `tc-f${i}`), noCtx, researchNet, state);
      handleToolResult(bashResult(`tc-f${i}`, false), researchNet, state);
    }
    expect(state.marking.canShare).toBe(3);

    // Share 3 times
    for (let i = 0; i < 3; i++) {
      const result = await handleToolCall(
        slackSend("channel:C123", `msg${i}`, `tc-s${i}`),
        noCtx,
        researchNet,
        state,
      );
      expect(result).toBeUndefined();
    }
    expect(state.marking.canShare).toBe(0);

    // 4th share — blocked
    const result = await handleToolCall(
      slackSend("channel:C123", "msg3", "tc-s3"),
      noCtx,
      researchNet,
      state,
    );
    expect(result?.block).toBe(true);
  });

  test("localhost curl is NOT treated as research", async () => {
    const state = gs();
    const result = await handleToolCall(
      { toolCallId: "tc-1", toolName: "bash", input: { command: "curl http://localhost:3000/health" } } as any,
      noCtx,
      researchNet,
      state,
    );
    // Should be treated as regular bash → free
    expect(result).toBeUndefined();
    expect(state.marking.canShare).toBe(0); // no share token earned
  });
});
