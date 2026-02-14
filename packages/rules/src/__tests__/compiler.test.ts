import { describe, expect, it } from "bun:test";
import { compile } from "../compiler.js";
import {
  handleToolCall,
  handleToolResult,
  createGateState,
  autoAdvance,
  createGateManager,
} from "@petriflow/gate";
import type {
  GateToolCall,
  GateToolResult,
  GateContext,
  SkillNet,
  GateDecision,
} from "@petriflow/gate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let callIdCounter = 0;
function makeEvent(
  toolName: string,
  input: Record<string, unknown> = {},
): GateToolCall {
  return {
    toolCallId: `call-${++callIdCounter}`,
    toolName,
    input,
  };
}

function makeResult(
  event: GateToolCall,
  isError: boolean,
): GateToolResult {
  return {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input,
    isError,
  };
}

function makeCtx(confirmResult = true): GateContext {
  return {
    hasUI: confirmResult,
    confirm: async () => confirmResult,
  };
}

function initState(net: SkillNet<string>) {
  return createGateState(autoAdvance(net, { ...net.initialMarking }));
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe("compile — parser", () => {
  it("parses 'require A before B' as sequence rule", () => {
    const { nets } = compile("require backup before delete");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("require-backup-before-delete");
  });

  it("parses 'require human-approval before B' as approval rule", () => {
    const { nets } = compile("require human-approval before deploy");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("approve-before-deploy");
  });

  it("parses 'block A' as block rule", () => {
    const { nets } = compile("block rm");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("block-rm");
  });

  it("parses 'limit A to N per session' as session limit rule", () => {
    const { nets } = compile("limit deploy to 3 per session");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("limit-deploy-3");
  });

  it("parses 'limit A to N per action' as per-action limit rule", () => {
    const { nets } = compile("limit push to 1 per test");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("limit-push-1-per-test");
  });

  it("strips comments and blank lines", () => {
    const input = `
      # This is a comment
      block rm   # inline comment

      require backup before delete
    `;
    const { nets } = compile(input);
    expect(nets).toHaveLength(2);
    expect(nets[0]!.name).toBe("block-rm");
    expect(nets[1]!.name).toBe("require-backup-before-delete");
  });

  it("accepts an array of rule strings", () => {
    const { nets } = compile([
      "block rm",
      "require backup before delete",
    ]);
    expect(nets).toHaveLength(2);
  });

  it("rejects unknown keyword with descriptive error", () => {
    expect(() => compile("allow everything")).toThrow(
      /unknown keyword 'allow'/,
    );
  });

  it("rejects malformed require rule (missing 'before')", () => {
    expect(() => compile("require A after B")).toThrow(
      /expected 'before' at position 3, got 'after'/,
    );
  });

  it("rejects malformed limit rule (missing 'to')", () => {
    expect(() => compile("limit A for 3 per session")).toThrow(
      /expected 'to' at position 3, got 'for'/,
    );
  });

  it("rejects limit with non-integer count", () => {
    expect(() => compile("limit A to abc per session")).toThrow(
      /positive integer/,
    );
  });

  it("rejects limit with zero count", () => {
    expect(() => compile("limit A to 0 per session")).toThrow(
      /positive integer/,
    );
  });

  it("rejects block with extra tokens", () => {
    expect(() => compile("block A B")).toThrow(/expects 2 tokens, got 3/);
  });
});

// ---------------------------------------------------------------------------
// Semantic tests — require A before B
// ---------------------------------------------------------------------------

describe("require A before B", () => {
  it("A is allowed in initial state (deferred)", async () => {
    const net = compile("require backup before delete").nets[0]!;
    const state = initState(net);

    const event = makeEvent("backup");
    const result = await handleToolCall(event, makeCtx(), net, state);
    expect(result).toBeUndefined();
  });

  it("B is blocked before A succeeds", async () => {
    const net = compile("require backup before delete").nets[0]!;
    const state = initState(net);

    const result = await handleToolCall(
      makeEvent("delete"),
      makeCtx(),
      net,
      state,
    );
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });
  });

  it("B is allowed after A succeeds", async () => {
    const net = compile("require backup before delete").nets[0]!;
    const state = initState(net);

    // A fires (deferred)
    const aEvent = makeEvent("backup");
    await handleToolCall(aEvent, makeCtx(), net, state);
    handleToolResult(makeResult(aEvent, false), net, state);

    // B should now be allowed
    const bResult = await handleToolCall(
      makeEvent("delete"),
      makeCtx(),
      net,
      state,
    );
    expect(bResult).toBeUndefined();
  });

  it("cycle resets — B fires, then need A again", async () => {
    const net = compile("require backup before delete").nets[0]!;
    const state = initState(net);

    // A succeeds
    const a1 = makeEvent("backup");
    await handleToolCall(a1, makeCtx(), net, state);
    handleToolResult(makeResult(a1, false), net, state);

    // B fires
    await handleToolCall(makeEvent("delete"), makeCtx(), net, state);

    // B should be blocked again (back to ready, need A again)
    const b2 = await handleToolCall(
      makeEvent("delete"),
      makeCtx(),
      net,
      state,
    );
    expect(b2).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });
  });

  it("A failure does not unlock B", async () => {
    const net = compile("require backup before delete").nets[0]!;
    const state = initState(net);

    // A fires but fails
    const aEvent = makeEvent("backup");
    await handleToolCall(aEvent, makeCtx(), net, state);
    handleToolResult(makeResult(aEvent, true), net, state);

    // B should still be blocked
    const bResult = await handleToolCall(
      makeEvent("delete"),
      makeCtx(),
      net,
      state,
    );
    expect(bResult).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });
  });
});

// ---------------------------------------------------------------------------
// Semantic tests — require human-approval before B
// ---------------------------------------------------------------------------

describe("require human-approval before B", () => {
  it("B is blocked without UI", async () => {
    const net = compile("require human-approval before deploy").nets[0]!;
    const state = initState(net);

    const noUiCtx: GateContext = {
      hasUI: false,
      confirm: async () => false,
    };
    const result = await handleToolCall(
      makeEvent("deploy"),
      noUiCtx,
      net,
      state,
    );
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("requires UI"),
    });
  });

  it("B is blocked when human rejects", async () => {
    const net = compile("require human-approval before deploy").nets[0]!;
    const state = initState(net);

    const rejectCtx: GateContext = {
      hasUI: true,
      confirm: async () => false,
    };
    const result = await handleToolCall(
      makeEvent("deploy"),
      rejectCtx,
      net,
      state,
    );
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("rejected"),
    });
  });

  it("B is allowed when human approves", async () => {
    const net = compile("require human-approval before deploy").nets[0]!;
    const state = initState(net);

    const result = await handleToolCall(
      makeEvent("deploy"),
      makeCtx(true),
      net,
      state,
    );
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Semantic tests — block A
// ---------------------------------------------------------------------------

describe("block A", () => {
  it("A is always blocked", async () => {
    const net = compile("block rm").nets[0]!;
    const state = initState(net);

    const result = await handleToolCall(makeEvent("rm"), makeCtx(), net, state);
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("rm"),
    });
  });

  it("A stays blocked over multiple attempts", async () => {
    const net = compile("block rm").nets[0]!;
    const state = initState(net);

    for (let i = 0; i < 3; i++) {
      const result = await handleToolCall(
        makeEvent("rm"),
        makeCtx(),
        net,
        state,
      );
      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining("rm"),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Semantic tests — limit A to N per session
// ---------------------------------------------------------------------------

describe("limit A to N per session", () => {
  it("A works N times then is blocked", async () => {
    const net = compile("limit deploy to 3 per session").nets[0]!;
    const state = initState(net);

    // Should work 3 times
    for (let i = 0; i < 3; i++) {
      const result = await handleToolCall(
        makeEvent("deploy"),
        makeCtx(),
        net,
        state,
      );
      expect(result).toBeUndefined();
    }

    // 4th time should be blocked
    const result = await handleToolCall(
      makeEvent("deploy"),
      makeCtx(),
      net,
      state,
    );
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("deploy"),
    });
  });
});

// ---------------------------------------------------------------------------
// Semantic tests — limit A to N per action
// ---------------------------------------------------------------------------

describe("limit A to N per action", () => {
  it("A works once, blocked, refill restores budget", async () => {
    const net = compile("limit push to 1 per test").nets[0]!;
    const state = initState(net);

    // First push works
    const r1 = await handleToolCall(
      makeEvent("push"),
      makeCtx(),
      net,
      state,
    );
    expect(r1).toBeUndefined();

    // Second push blocked
    const r2 = await handleToolCall(
      makeEvent("push"),
      makeCtx(),
      net,
      state,
    );
    expect(r2).toEqual({
      block: true,
      reason: expect.stringContaining("push"),
    });

    // Refill via test
    const r3 = await handleToolCall(
      makeEvent("test"),
      makeCtx(),
      net,
      state,
    );
    expect(r3).toBeUndefined();

    // Push works again
    const r4 = await handleToolCall(
      makeEvent("push"),
      makeCtx(),
      net,
      state,
    );
    expect(r4).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Composition test — multiple rules via GateManager
// ---------------------------------------------------------------------------

describe("multiple rules compose via GateManager", () => {
  it("if one net blocks, call is blocked", async () => {
    const { nets } = compile([
      "require backup before delete",
      "block rm",
    ]);

    const manager = createGateManager(nets, { mode: "enforce" });

    // rm is always blocked by block-rm net
    const result = await manager.handleToolCall(makeEvent("rm"), makeCtx());
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("block-rm"),
    });

    // delete is blocked by sequence net (no backup yet)
    const result2 = await manager.handleToolCall(
      makeEvent("delete"),
      makeCtx(),
    );
    expect(result2).toEqual({
      block: true,
      reason: expect.stringContaining("require-backup-before-delete"),
    });

    // backup is allowed (deferred in sequence net, abstain in block net)
    const backupEvent = makeEvent("backup");
    const result3 = await manager.handleToolCall(backupEvent, makeCtx());
    expect(result3).toBeUndefined();
  });
});
