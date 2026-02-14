import { describe, test, expect } from "bun:test";
import { communicateNet, extractChannel } from "../nets/communicate.js";
import {
  handleToolCall,
  handleToolResult,
  createGateState,
  autoAdvance,
  formatMarking,
} from "@petriflow/gate";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

type Place = "idle" | "ready" | "canSend";

function gs() {
  return createGateState<Place>(autoAdvance(communicateNet, { ...communicateNet.initialMarking }));
}

const noCtx = { hasUI: false } as any;

function slackRead(channelId: string, toolCallId = "tc-1") {
  return {
    toolCallId,
    toolName: "slack",
    input: { action: "readMessages", channelId },
  } as any;
}

function slackSend(to: string, content: string, toolCallId = "tc-2") {
  return {
    toolCallId,
    toolName: "slack",
    input: { action: "sendMessage", to, content },
  } as any;
}

function slackReact(channelId: string, messageId: string, emoji: string, toolCallId = "tc-3") {
  return {
    toolCallId,
    toolName: "slack",
    input: { action: "react", channelId, messageId, emoji },
  } as any;
}

function toolResult(toolCallId: string, isError: boolean) {
  return { toolCallId, toolName: "slack", input: {}, isError } as any;
}

// -----------------------------------------------------------------------
// extractChannel
// -----------------------------------------------------------------------

describe("extractChannel", () => {
  test("extracts from readMessages", () => {
    expect(extractChannel({ action: "readMessages", channelId: "C123" })).toBe("C123");
  });

  test("extracts from sendMessage", () => {
    expect(extractChannel({ action: "sendMessage", to: "channel:C456" })).toBe("channel:C456");
  });

  test("returns null when no channel info", () => {
    expect(extractChannel({ action: "emojiList" })).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Net basics
// -----------------------------------------------------------------------

describe("communicateNet", () => {
  test("auto-advances from idle to ready", () => {
    const state = gs();
    expect(state.marking.ready).toBe(1);
    expect(state.marking.idle).toBe(0);
  });

  test("reactions are free", async () => {
    const state = gs();
    const result = await handleToolCall(
      slackReact("C123", "1234.5678", "thumbsup"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("non-slack tools are free", async () => {
    const state = gs();
    const result = await handleToolCall(
      { toolCallId: "tc-1", toolName: "read", input: { path: "/tmp/foo" } } as any,
      noCtx,
      communicateNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("send blocked without prior observe", async () => {
    const state = gs();
    const result = await handleToolCall(
      slackSend("channel:C123", "hello"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result?.block).toBe(true);
  });

  test("observe is deferred — allowed but doesn't fire yet", async () => {
    const state = gs();
    const result = await handleToolCall(
      slackRead("C123"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result).toBeUndefined();
    // Still in ready — hasn't fired yet
    expect(state.marking.ready).toBe(1);
    expect(state.marking.canSend).toBe(0);
    expect(state.pending.size).toBe(1);
  });

  test("observe fires on successful tool_result", async () => {
    const state = gs();
    await handleToolCall(slackRead("C123", "tc-read"), noCtx, communicateNet, state);
    handleToolResult(toolResult("tc-read", false), communicateNet, state);
    expect(state.marking.canSend).toBe(1);
    expect(state.marking.ready).toBe(0);
  });

  test("observe does NOT fire on failed tool_result", async () => {
    const state = gs();
    await handleToolCall(slackRead("C123", "tc-read"), noCtx, communicateNet, state);
    handleToolResult(toolResult("tc-read", true), communicateNet, state);
    expect(state.marking.canSend).toBe(0);
    expect(state.marking.ready).toBe(1);
  });

  test("full cycle: observe → send → back to ready", async () => {
    const state = gs();

    // Observe
    await handleToolCall(slackRead("C123", "tc-read"), noCtx, communicateNet, state);
    handleToolResult(
      { toolCallId: "tc-read", toolName: "slack", input: { action: "readMessages", channelId: "C123" }, isError: false } as any,
      communicateNet,
      state,
    );
    expect(state.marking.canSend).toBe(1);

    // Send
    const sendResult = await handleToolCall(
      slackSend("C123", "hello", "tc-send"),
      noCtx,
      communicateNet,
      state,
    );
    expect(sendResult).toBeUndefined();
    expect(state.marking.ready).toBe(1);
    expect(state.marking.canSend).toBe(0);
  });

  test("channel mismatch: observe C123 then send to C456 → blocked", async () => {
    const state = gs();

    // Observe C123
    await handleToolCall(slackRead("C123", "tc-read"), noCtx, communicateNet, state);
    handleToolResult(
      { toolCallId: "tc-read", toolName: "slack", input: { action: "readMessages", channelId: "C123" }, isError: false } as any,
      communicateNet,
      state,
    );

    // Try to send to C456
    const result = await handleToolCall(
      slackSend("channel:C456", "hello", "tc-send"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("C456");
  });

  test("channel match: observe C123 then send to C123 → allowed", async () => {
    const state = gs();

    // Observe C123
    await handleToolCall(slackRead("C123", "tc-read"), noCtx, communicateNet, state);
    handleToolResult(
      { toolCallId: "tc-read", toolName: "slack", input: { action: "readMessages", channelId: "C123" }, isError: false } as any,
      communicateNet,
      state,
    );

    // Send to C123
    const result = await handleToolCall(
      slackSend("C123", "hello", "tc-send"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  test("second send requires second observe", async () => {
    const state = gs();

    // Observe + send cycle 1
    await handleToolCall(slackRead("C123", "tc-r1"), noCtx, communicateNet, state);
    handleToolResult(
      { toolCallId: "tc-r1", toolName: "slack", input: { action: "readMessages", channelId: "C123" }, isError: false } as any,
      communicateNet,
      state,
    );
    await handleToolCall(slackSend("C123", "msg1", "tc-s1"), noCtx, communicateNet, state);

    // Second send without re-reading → blocked
    const result = await handleToolCall(
      slackSend("C123", "msg2", "tc-s2"),
      noCtx,
      communicateNet,
      state,
    );
    expect(result?.block).toBe(true);
  });
});
