import { describe, expect, it } from "bun:test";
import { compile, loadRules } from "../compiler.js";
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

// ---------------------------------------------------------------------------
// Dot notation — parser tests
// ---------------------------------------------------------------------------

describe("compile — dot notation parser", () => {
  it("parses dotted tool names in sequence rules", () => {
    const { nets } = compile(
      "require discord.readMessages before discord.sendMessage",
    );
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe(
      "require-discord.readMessages-before-discord.sendMessage",
    );
  });

  it("parses dotted tool names in block rules", () => {
    const { nets } = compile("block discord.timeout");
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("block-discord.timeout");
  });

  it("parses dotted tool names in approval rules", () => {
    const { nets } = compile(
      "require human-approval before discord.sendMessage",
    );
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("approve-before-discord.sendMessage");
  });

  it("parses dotted tool names in limit rules", () => {
    const { nets } = compile(
      "limit discord.sendMessage to 5 per session",
    );
    expect(nets).toHaveLength(1);
    expect(nets[0]!.name).toBe("limit-discord.sendMessage-5");
  });

  it("attaches toolMapper when dotted tools are used", () => {
    const net = compile("block discord.sendMessage").nets[0]!;
    expect(net.toolMapper).toBeDefined();
  });

  it("does not attach toolMapper for plain tool names", () => {
    const net = compile("block rm").nets[0]!;
    expect(net.toolMapper).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dot notation — semantic tests via GateManager
// ---------------------------------------------------------------------------

describe("dot notation — action dispatch", () => {
  it("discord.sendMessage is blocked, discord.readMessages passes through", async () => {
    const { nets } = compile("block discord.sendMessage");
    const manager = createGateManager(nets, { mode: "enforce" });

    // sendMessage is blocked
    const r1 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("discord.sendMessage"),
    });

    // readMessages passes through (net abstains — unknown tool)
    const r2 = await manager.handleToolCall(
      makeEvent("discord", { action: "readMessages", channelId: "123" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("require human-approval before discord.sendMessage", async () => {
    const { nets } = compile(
      "require human-approval before discord.sendMessage",
    );
    const manager = createGateManager(nets, { mode: "enforce" });

    // sendMessage blocked without approval
    const noUiCtx: GateContext = {
      hasUI: false,
      confirm: async () => false,
    };
    const r1 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      noUiCtx,
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("requires UI"),
    });

    // sendMessage allowed with approval
    const r2 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(true),
    );
    expect(r2).toBeUndefined();

    // react passes through (net abstains)
    const r3 = await manager.handleToolCall(
      makeEvent("discord", { action: "react", emoji: "ok" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("require discord.readMessages before discord.sendMessage", async () => {
    const { nets } = compile(
      "require discord.readMessages before discord.sendMessage",
    );
    const manager = createGateManager(nets, { mode: "enforce" });

    // sendMessage blocked without prior readMessages
    const r1 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("discord.sendMessage"),
    });

    // readMessages allowed (deferred)
    const readEvent = makeEvent("discord", {
      action: "readMessages",
      channelId: "123",
    });
    const r2 = await manager.handleToolCall(readEvent, makeCtx());
    expect(r2).toBeUndefined();

    // deliver successful result
    manager.handleToolResult(makeResult(readEvent, false));

    // sendMessage now allowed
    const r3 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("limit discord.sendMessage to 2 per session", async () => {
    const { nets } = compile(
      "limit discord.sendMessage to 2 per session",
    );
    const manager = createGateManager(nets, { mode: "enforce" });

    // First two sends work
    for (let i = 0; i < 2; i++) {
      const r = await manager.handleToolCall(
        makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
        makeCtx(),
      );
      expect(r).toBeUndefined();
    }

    // Third is blocked
    const r3 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(),
    );
    expect(r3).toEqual({
      block: true,
      reason: expect.stringContaining("discord.sendMessage"),
    });

    // react still passes through
    const r4 = await manager.handleToolCall(
      makeEvent("discord", { action: "react", emoji: "ok" }),
      makeCtx(),
    );
    expect(r4).toBeUndefined();
  });

  it("multiple dotted rules compose correctly", async () => {
    const { nets } = compile([
      "require human-approval before discord.sendMessage",
      "block discord.timeout",
      "limit discord.sendMessage to 3 per session",
    ]);
    const manager = createGateManager(nets, { mode: "enforce" });

    // timeout always blocked
    const r1 = await manager.handleToolCall(
      makeEvent("discord", { action: "timeout", guildId: "999" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-discord.timeout"),
    });

    // sendMessage needs approval (and has budget)
    const r2 = await manager.handleToolCall(
      makeEvent("discord", { action: "sendMessage", to: "channel:123" }),
      makeCtx(true),
    );
    expect(r2).toBeUndefined();

    // readMessages passes through all nets
    const r3 = await manager.handleToolCall(
      makeEvent("discord", { action: "readMessages", channelId: "123" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("non-action tool calls pass through dotted nets unchanged", async () => {
    const { nets } = compile("block discord.sendMessage");
    const manager = createGateManager(nets, { mode: "enforce" });

    // A tool called "read" (no action field) should pass through
    const r = await manager.handleToolCall(
      makeEvent("read", { path: "/tmp/foo" }),
      makeCtx(),
    );
    expect(r).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Map statements — parser tests
// ---------------------------------------------------------------------------

describe("compile — map statement parser", () => {
  it("parses 'map bash.command /pattern/ as name'", () => {
    const { nets } = compile(`
      map bash.command /rm\\s/ as delete
      block delete
    `);
    expect(nets).toHaveLength(1);
    expect(nets[0]!.toolMapper).toBeDefined();
  });

  it("rejects map without dot in tool.field", () => {
    expect(() => compile("map bash /rm/ as delete")).toThrow(
      /expected <tool>\.<field>/,
    );
  });

  it("rejects map with missing 'as' keyword", () => {
    expect(() =>
      compile("map bash.command /rm/ to delete"),
    ).toThrow(/expected 'as' at position 4/);
  });

  it("rejects map with empty regex", () => {
    expect(() => compile("map bash.command // as delete")).toThrow(
      /empty regex/,
    );
  });

  it("bare word pattern compiles to word-boundary regex", () => {
    const { nets } = compile(`
      map bash.command rm as delete
      block delete
    `);
    expect(nets).toHaveLength(1);
    expect(nets[0]!.toolMapper).toBeDefined();
  });

  it("rejects map with wrong token count", () => {
    expect(() => compile("map bash.command /rm/")).toThrow(
      /expects 5 tokens/,
    );
  });

  it("map statements don't produce nets by themselves", () => {
    const { nets } = compile("map bash.command /rm/ as delete");
    expect(nets).toHaveLength(0);
  });

  it("no toolMapper when no maps and no dots", () => {
    const net = compile("block rm").nets[0]!;
    expect(net.toolMapper).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Map statements — semantic tests via GateManager
// ---------------------------------------------------------------------------

describe("map statements — bash command gating", () => {
  it("require backup before delete (bash commands)", async () => {
    const { nets } = compile(`
      map bash.command /\\bcp\\s+-r\\b/ as backup
      map bash.command /\\brm\\s/ as delete
      require backup before delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // rm is blocked (no backup yet)
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });

    // cp -r is allowed (deferred backup)
    const cpEvent = makeEvent("bash", {
      command: "cp -r build/ /tmp/build-bak",
    });
    const r2 = await manager.handleToolCall(cpEvent, makeCtx());
    expect(r2).toBeUndefined();

    // backup succeeds
    manager.handleToolResult(makeResult(cpEvent, false));

    // rm now allowed
    const r3 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("block destructive commands", async () => {
    const { nets } = compile(`
      map bash.command /\\brm\\s/ as delete
      map bash.command /DROP\\s+TABLE/ as drop-table
      block delete
      block drop-table
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // rm blocked
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf /" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-delete"),
    });

    // DROP TABLE blocked
    const r2 = await manager.handleToolCall(
      makeEvent("bash", { command: "psql -c 'DROP TABLE users'" }),
      makeCtx(),
    );
    expect(r2).toEqual({
      block: true,
      reason: expect.stringContaining("block-drop-table"),
    });

    // ls passes through (no map matches, all nets abstain)
    const r3 = await manager.handleToolCall(
      makeEvent("bash", { command: "ls -la" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("require human-approval before mapped tool", async () => {
    const { nets } = compile(`
      map bash.command /\\bgit\\s+push\\b/ as git-push
      require human-approval before git-push
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // git push needs approval
    const noUiCtx: GateContext = {
      hasUI: false,
      confirm: async () => false,
    };
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "git push origin main" }),
      noUiCtx,
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("requires UI"),
    });

    // git status passes through (no map matches)
    const r2 = await manager.handleToolCall(
      makeEvent("bash", { command: "git status" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("limit mapped tool per session", async () => {
    const { nets } = compile(`
      map bash.command /\\bdeploy\\b/ as deploy
      limit deploy to 2 per session
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // Two deploys work
    for (let i = 0; i < 2; i++) {
      const r = await manager.handleToolCall(
        makeEvent("bash", { command: "deploy --env staging" }),
        makeCtx(),
      );
      expect(r).toBeUndefined();
    }

    // Third blocked
    const r3 = await manager.handleToolCall(
      makeEvent("bash", { command: "deploy --env prod" }),
      makeCtx(),
    );
    expect(r3).toEqual({
      block: true,
      reason: expect.stringContaining("deploy"),
    });
  });

  it("map on non-command field works", async () => {
    const { nets } = compile(`
      map slack.action /sendMessage/ as slack-send
      block slack-send
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // sendMessage blocked
    const r1 = await manager.handleToolCall(
      makeEvent("slack", { action: "sendMessage", to: "channel:C123" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-slack-send"),
    });

    // readMessages passes through
    const r2 = await manager.handleToolCall(
      makeEvent("slack", { action: "readMessages", channelId: "C123" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("maps and dot notation coexist", async () => {
    const { nets } = compile(`
      map bash.command /\\brm\\s/ as delete
      map bash.command /\\bcp\\s+-r/ as backup
      require backup before delete
      block discord.timeout
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // bash rm blocked (no backup)
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });

    // discord timeout blocked
    const r2 = await manager.handleToolCall(
      makeEvent("discord", { action: "timeout", guildId: "999" }),
      makeCtx(),
    );
    expect(r2).toEqual({
      block: true,
      reason: expect.stringContaining("block-discord.timeout"),
    });

    // discord react passes through
    const r3 = await manager.handleToolCall(
      makeEvent("discord", { action: "react", emoji: "ok" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });

  it("map takes priority over dot notation for same tool", async () => {
    // If bash has both a map and could be dotted, map wins
    const { nets } = compile(`
      map bash.command /\\brm\\s/ as delete
      block delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // bash with command matching the map → resolves to "delete"
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf /", action: "something" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-delete"),
    });
  });
});

// ---------------------------------------------------------------------------
// Bare word patterns (no regex needed)
// ---------------------------------------------------------------------------

describe("map with bare word patterns", () => {
  it("bare word matches the command keyword", async () => {
    const { nets } = compile(`
      map bash.command rm as delete
      block delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // "rm -rf build/" matches word "rm"
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-delete"),
    });
  });

  it("bare word matches at start of command", async () => {
    const { nets } = compile(`
      map bash.command rm as delete
      block delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // "rm" at the start of the command
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm old-file.txt" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-delete"),
    });
  });

  it("bare word does not match partial words", async () => {
    const { nets } = compile(`
      map bash.command rm as delete
      block delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // "format" contains "rm" but not as a word → should pass
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "format disk" }),
      makeCtx(),
    );
    expect(r1).toBeUndefined();

    // "mkdir" contains "rm" backwards but not as a word → should pass
    const r2 = await manager.handleToolCall(
      makeEvent("bash", { command: "mkdir /tmp/foo" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("bare word with special regex chars is escaped", async () => {
    const { nets } = compile(`
      map bash.command node.js as run-node
      block run-node
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // "node.js" matches literally (dot is escaped)
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "run node.js script" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("block-run-node"),
    });

    // "nodejs" should not match (no dot)
    const r2 = await manager.handleToolCall(
      makeEvent("bash", { command: "nodejs server.js" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("require backup before delete with bare words", async () => {
    const { nets } = compile(`
      map bash.command cp as backup
      map bash.command rm as delete
      require backup before delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // rm blocked
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm old-file.txt" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });

    // cp allowed (deferred)
    const cpEvent = makeEvent("bash", { command: "cp old-file.txt backup/" });
    await manager.handleToolCall(cpEvent, makeCtx());
    manager.handleToolResult(makeResult(cpEvent, false));

    // rm now allowed
    const r2 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm old-file.txt" }),
      makeCtx(),
    );
    expect(r2).toBeUndefined();
  });

  it("regex escape hatch still works alongside bare words", async () => {
    const { nets } = compile(`
      map bash.command rm as delete
      map bash.command /cp\\s+-r/ as backup
      require backup before delete
    `);
    const manager = createGateManager(nets, { mode: "enforce" });

    // rm blocked
    const r1 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r1).toEqual({
      block: true,
      reason: expect.stringContaining("delete"),
    });

    // cp (without -r) does NOT match the regex pattern → net abstains
    const cpEvent = makeEvent("bash", { command: "cp file.txt /tmp/" });
    const r2 = await manager.handleToolCall(cpEvent, makeCtx());
    expect(r2).toBeUndefined();

    // cp -r DOES match
    const cprEvent = makeEvent("bash", {
      command: "cp -r build/ /tmp/build-bak",
    });
    await manager.handleToolCall(cprEvent, makeCtx());
    manager.handleToolResult(makeResult(cprEvent, false));

    // rm now allowed
    const r3 = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(r3).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Verification — compile() analyses each net
// ---------------------------------------------------------------------------

describe("compile — verification", () => {
  it("returns verification for each compiled net", () => {
    const { verification } = compile(`
      require backup before delete
      block rm
      limit deploy to 3 per session
    `);
    expect(verification).toHaveLength(3);
    expect(verification[0]!.name).toBe("require-backup-before-delete");
    expect(verification[1]!.name).toBe("block-rm");
    expect(verification[2]!.name).toBe("limit-deploy-3");
  });

  it("reports reachable states for sequence rule", () => {
    const { verification } = compile("require backup before delete");
    expect(verification[0]!.reachableStates).toBeGreaterThan(0);
  });

  it("reports reachable states for block rule", () => {
    const { verification } = compile("block rm");
    // block net: idle=1 → start → ready=1. Two states total.
    expect(verification[0]!.reachableStates).toBe(2);
  });

  it("reports reachable states for limit rule", () => {
    const { verification } = compile("limit deploy to 3 per session");
    // idle → ready,budget=3 → ready,budget=2 → ready,budget=1 → ready,budget=0
    // 5 states: initial + 4
    expect(verification[0]!.reachableStates).toBe(5);
  });

  it("reports reachable states for approval rule", () => {
    const { verification } = compile(
      "require human-approval before deploy",
    );
    expect(verification[0]!.reachableStates).toBeGreaterThan(0);
  });

  it("empty rules produce empty verification", () => {
    const { verification } = compile("# just a comment");
    expect(verification).toHaveLength(0);
  });
});

describe("loadRules", () => {
  it("reads and compiles a .rules file", () => {
    const path = require("path");
    const fs = require("fs");
    const tmpDir = require("os").tmpdir();
    const file = path.join(tmpDir, "test-safety.rules");
    fs.writeFileSync(file, "require backup before delete\nblock rm\n");

    const { nets, verification } = loadRules(file);
    expect(nets).toHaveLength(2);
    expect(verification).toHaveLength(2);
    expect(verification[0]!.name).toBe("require-backup-before-delete");
    expect(verification[1]!.name).toBe("block-rm");

    fs.unlinkSync(file);
  });

  it("throws on missing file", () => {
    expect(() => loadRules("/nonexistent/safety.rules")).toThrow();
  });
});
