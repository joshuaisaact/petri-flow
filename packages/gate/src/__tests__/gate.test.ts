import { describe, expect, it } from "bun:test";
import type { Marking } from "@petriflow/engine";
import type { GateToolCall, GateToolResult, GateContext } from "../events.js";
import { autoAdvance } from "../advance.js";
import {
  handleToolCall,
  handleToolResult,
  formatMarking,
  getEnabledToolTransitions,
  createGateState,
} from "../gate.js";
import type { GateState } from "../gate.js";
import { defineSkillNet } from "../types.js";
import { toolApprovalNet } from "../../../pi-extension/src/nets/tool-approval.js";
import { implementNet } from "../../../pi-extension/src/nets/implement.js";
import {
  nukeNet,
  extractBackupTarget,
  extractDestructiveTarget,
  pathCovers,
} from "../../../pi-extension/src/nets/nuke.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let callIdCounter = 0;
function makeEvent(toolName: string, input: Record<string, unknown> = {}): GateToolCall {
  return {
    toolCallId: `call-${++callIdCounter}`,
    toolName,
    input,
  };
}

function makeBashEvent(command: string): GateToolCall {
  return makeEvent("bash", { command });
}

function makeResult(
  callEvent: GateToolCall,
  isError: boolean,
): GateToolResult {
  return {
    toolCallId: callEvent.toolCallId,
    toolName: callEvent.toolName,
    input: callEvent.input,
    isError,
  };
}

function makeCtx(confirmResult = true): GateContext {
  return {
    hasUI: true,
    confirm: async () => confirmResult,
  };
}

function gs<P extends string>(marking: Marking<P>): GateState<P> {
  return createGateState(marking);
}

// A minimal net for focused tests
const places = ["a", "b", "c", "d", "e"] as const;
type P = (typeof places)[number];

const simpleNet = defineSkillNet<P>({
  name: "simple",
  places: [...places],
  terminalPlaces: ["e"],
  freeTools: ["ls", "read"],
  initialMarking: { a: 1, b: 0, c: 0, d: 0, e: 0 },
  transitions: [
    { name: "setup", type: "auto", inputs: ["a"], outputs: ["b"] },
    { name: "useBash", type: "auto", inputs: ["b"], outputs: ["c"], tools: ["bash"] },
    { name: "post", type: "auto", inputs: ["c"], outputs: ["d"] },
    { name: "doWrite", type: "manual", inputs: ["d"], outputs: ["e"], tools: ["write"] },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("autoAdvance", () => {
  it("fires structural transitions from initial state", () => {
    const result = autoAdvance(simpleNet, { ...simpleNet.initialMarking });
    expect(result.a).toBe(0);
    expect(result.b).toBe(1);
  });

  it("stops at tool-gated transitions", () => {
    const result = autoAdvance(simpleNet, { ...simpleNet.initialMarking });
    expect(result.b).toBe(1);
    expect(result.c).toBe(0);
  });

  it("cascades multiple structural transitions", () => {
    const marking: Marking<P> = { a: 0, b: 0, c: 1, d: 0, e: 0 };
    const result = autoAdvance(simpleNet, marking);
    expect(result.c).toBe(0);
    expect(result.d).toBe(1);
  });

  it("avoids ambiguous structural transitions", () => {
    type AP = "start" | "left" | "right";
    const ambiguousNet = defineSkillNet<AP>({
      name: "ambiguous",
      places: ["start", "left", "right"],
      terminalPlaces: ["left", "right"],
      freeTools: [],
      initialMarking: { start: 1, left: 0, right: 0 },
      transitions: [
        { name: "goLeft", type: "auto", inputs: ["start"], outputs: ["left"] },
        { name: "goRight", type: "auto", inputs: ["start"], outputs: ["right"] },
      ],
    });
    const result = autoAdvance(ambiguousNet, { ...ambiguousNet.initialMarking });
    expect(result.start).toBe(1);
    expect(result.left).toBe(0);
    expect(result.right).toBe(0);
  });

  it("handles AND-join (all inputs required)", () => {
    type JP = "x" | "y" | "z" | "joined";
    const joinNet = defineSkillNet<JP>({
      name: "join",
      places: ["x", "y", "z", "joined"],
      terminalPlaces: ["joined"],
      freeTools: [],
      initialMarking: { x: 1, y: 1, z: 0, joined: 0 },
      transitions: [
        { name: "join", type: "auto", inputs: ["x", "y", "z"], outputs: ["joined"] },
      ],
    });
    const partial = autoAdvance(joinNet, { ...joinNet.initialMarking });
    expect(partial.joined).toBe(0);
    const full = autoAdvance(joinNet, { x: 1, y: 1, z: 1, joined: 0 });
    expect(full.joined).toBe(1);
  });
});

describe("handleToolCall", () => {
  it("allows free tools regardless of state", async () => {
    const state = gs<P>({ a: 1, b: 0, c: 0, d: 0, e: 0 });
    const result = await handleToolCall(makeEvent("ls"), makeCtx(), simpleNet, state);
    expect(result).toBeUndefined();
  });

  it("allows free tools even with empty marking", async () => {
    const state = gs<P>({ a: 0, b: 0, c: 0, d: 0, e: 0 });
    const result = await handleToolCall(makeEvent("read"), makeCtx(), simpleNet, state);
    expect(result).toBeUndefined();
  });

  it("blocks gated tool when no matching transition is enabled", async () => {
    const state = gs(autoAdvance(simpleNet, { ...simpleNet.initialMarking }));
    const result = await handleToolCall(makeEvent("write"), makeCtx(), simpleNet, state);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("write") });
  });

  it("allows gated tool when matching transition is enabled", async () => {
    const state = gs<P>({ a: 0, b: 1, c: 0, d: 0, e: 0 });
    const result = await handleToolCall(makeEvent("bash"), makeCtx(), simpleNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.b).toBe(0);
    expect(state.marking.d).toBe(1);
  });

  it("fires transition and updates marking on gated tool use", async () => {
    const state = gs<P>({ a: 0, b: 1, c: 0, d: 0, e: 0 });
    await handleToolCall(makeEvent("bash"), makeCtx(), simpleNet, state);
    expect(state.marking.c).toBe(0);
    expect(state.marking.d).toBe(1);
  });

  it("blocks manual transition when human rejects", async () => {
    const state = gs<P>({ a: 0, b: 0, c: 0, d: 1, e: 0 });
    const result = await handleToolCall(makeEvent("write"), makeCtx(false), simpleNet, state);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("rejected") });
    expect(state.marking.d).toBe(1);
  });

  it("allows manual transition when human approves", async () => {
    const state = gs<P>({ a: 0, b: 0, c: 0, d: 1, e: 0 });
    const result = await handleToolCall(makeEvent("write"), makeCtx(true), simpleNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.d).toBe(0);
    expect(state.marking.e).toBe(1);
  });

  it("blocks manual transition when no UI available", async () => {
    const state = gs<P>({ a: 0, b: 0, c: 0, d: 1, e: 0 });
    const noUiCtx: GateContext = { hasUI: false, confirm: async () => false };
    const result = await handleToolCall(makeEvent("write"), noUiCtx, simpleNet, state);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("requires UI") });
  });
});

describe("getEnabledToolTransitions", () => {
  it("returns tool transitions that are structurally enabled", () => {
    const marking: Marking<P> = { a: 0, b: 1, c: 0, d: 0, e: 0 };
    const enabled = getEnabledToolTransitions(simpleNet, marking);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.name).toBe("useBash");
  });

  it("returns empty when no tool transitions enabled", () => {
    const marking: Marking<P> = { a: 1, b: 0, c: 0, d: 0, e: 0 };
    const enabled = getEnabledToolTransitions(simpleNet, marking);
    expect(enabled).toHaveLength(0);
  });
});

describe("formatMarking", () => {
  it("shows only places with tokens", () => {
    const s = formatMarking({ a: 0, b: 2, c: 1, d: 0, e: 0 } as Marking<P>);
    expect(s).toBe("b:2, c:1");
  });
});

describe("toolApprovalNet", () => {
  it("auto-advances from idle to ready", () => {
    const marking = autoAdvance(toolApprovalNet, { ...toolApprovalNet.initialMarking });
    expect(marking.idle).toBe(0);
    expect(marking.ready).toBe(1);
  });

  it("free tools always allowed", async () => {
    const state = gs(autoAdvance(toolApprovalNet, { ...toolApprovalNet.initialMarking }));
    for (const tool of ["ls", "read", "grep", "find"]) {
      const result = await handleToolCall(makeEvent(tool), makeCtx(), toolApprovalNet, state);
      expect(result).toBeUndefined();
    }
    expect(state.marking.ready).toBe(1);
  });

  it("bash blocked when human rejects", async () => {
    const state = gs(autoAdvance(toolApprovalNet, { ...toolApprovalNet.initialMarking }));
    const result = await handleToolCall(makeEvent("bash"), makeCtx(false), toolApprovalNet, state);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("rejected") });
  });

  it("bash allowed when human approves, token returns to ready", async () => {
    const state = gs(autoAdvance(toolApprovalNet, { ...toolApprovalNet.initialMarking }));
    const result = await handleToolCall(makeEvent("bash"), makeCtx(true), toolApprovalNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.ready).toBe(1);
  });

  it("repeated bash calls each require approval", async () => {
    const state = gs(autoAdvance(toolApprovalNet, { ...toolApprovalNet.initialMarking }));
    const ctx = makeCtx(true);
    await handleToolCall(makeEvent("bash"), ctx, toolApprovalNet, state);
    expect(state.marking.ready).toBe(1);
    await handleToolCall(makeEvent("bash"), ctx, toolApprovalNet, state);
    expect(state.marking.ready).toBe(1);
  });
});

describe("implementNet", () => {
  it("auto-advances from idle to working", () => {
    const marking = autoAdvance(implementNet, { ...implementNet.initialMarking });
    expect(marking.idle).toBe(0);
    expect(marking.working).toBe(1);
  });

  it("all standard tools are free", async () => {
    const state = gs(autoAdvance(implementNet, { ...implementNet.initialMarking }));
    for (const tool of ["ls", "read", "grep", "find", "write", "edit"]) {
      const result = await handleToolCall(makeEvent(tool), makeCtx(), implementNet, state);
      expect(result).toBeUndefined();
    }
    expect(state.marking.working).toBe(1);
  });

  it("regular bash is free (toolMapper resolves to 'bash')", async () => {
    const state = gs(autoAdvance(implementNet, { ...implementNet.initialMarking }));
    const result = await handleToolCall(makeBashEvent("bun test"), makeCtx(), implementNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.working).toBe(1);
  });

  it("git commit is gated", async () => {
    const state = gs(autoAdvance(implementNet, { ...implementNet.initialMarking }));
    const blocked = await handleToolCall(
      makeBashEvent('git commit -m "feat"'),
      makeCtx(false),
      implementNet,
      state,
    );
    expect(blocked).toEqual({ block: true, reason: expect.stringContaining("rejected") });

    const allowed = await handleToolCall(
      makeBashEvent('git commit -m "feat"'),
      makeCtx(true),
      implementNet,
      state,
    );
    expect(allowed).toBeUndefined();
    expect(state.marking.committed).toBe(1);
  });

  it("git push blocked before commit, allowed after", async () => {
    const state = gs(autoAdvance(implementNet, { ...implementNet.initialMarking }));
    const ctx = makeCtx(true);

    const blocked = await handleToolCall(makeBashEvent("git push"), ctx, implementNet, state);
    expect(blocked).toEqual({ block: true, reason: expect.stringContaining("git-push") });

    await handleToolCall(makeBashEvent('git commit -m "fix"'), ctx, implementNet, state);
    const allowed = await handleToolCall(makeBashEvent("git push"), ctx, implementNet, state);
    expect(allowed).toBeUndefined();
    expect(state.marking.working).toBe(1);
  });

  it("full cycle: work → commit → push → work again", async () => {
    const state = gs(autoAdvance(implementNet, { ...implementNet.initialMarking }));
    const ctx = makeCtx(true);

    await handleToolCall(makeBashEvent("bun test"), ctx, implementNet, state);
    await handleToolCall(makeEvent("write"), ctx, implementNet, state);
    await handleToolCall(makeBashEvent('git commit -m "v1"'), ctx, implementNet, state);
    await handleToolCall(makeBashEvent("git push"), ctx, implementNet, state);
    expect(state.marking.working).toBe(1);

    await handleToolCall(makeBashEvent('git commit -m "v2"'), ctx, implementNet, state);
    expect(state.marking.committed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Nuke net
// ---------------------------------------------------------------------------

describe("path extraction", () => {
  it("extracts backup targets", () => {
    expect(extractBackupTarget("git stash")).toBe(".");
    expect(extractBackupTarget("cp -r src/ /tmp/bak")).toBe("src");
    expect(extractBackupTarget("tar czf backup.tar.gz ./data")).toBe("data");
    expect(extractBackupTarget("pg_dump mydb > dump.sql")).toBe("database");
    expect(extractBackupTarget("bun test")).toBeNull();
    expect(extractBackupTarget("rm -rf build/")).toBeNull();
  });

  it("extracts destructive targets", () => {
    expect(extractDestructiveTarget("rm -rf build/")).toBe("build");
    expect(extractDestructiveTarget("rm foo.txt")).toBe("foo.txt");
    expect(extractDestructiveTarget("git reset --hard")).toBe(".");
    expect(extractDestructiveTarget("git clean -fd")).toBe(".");
    expect(extractDestructiveTarget("DROP TABLE users")).toBe("database");
    expect(extractDestructiveTarget("bun test")).toBeNull();
    expect(extractDestructiveTarget("git stash")).toBeNull();
  });
});

describe("pathCovers", () => {
  it(". covers everything", () => {
    expect(pathCovers(".", "build")).toBe(true);
    expect(pathCovers(".", "src/foo")).toBe(true);
    expect(pathCovers(".", ".")).toBe(true);
  });

  it("exact match", () => {
    expect(pathCovers("build", "build")).toBe(true);
    expect(pathCovers("src", "src")).toBe(true);
  });

  it("parent covers child", () => {
    expect(pathCovers("src", "src/foo")).toBe(true);
    expect(pathCovers("src", "src/deep/nested")).toBe(true);
  });

  it("unrelated paths don't cover", () => {
    expect(pathCovers("src", "build")).toBe(false);
    expect(pathCovers("src", "srcx")).toBe(false);
  });

  it("database matches database", () => {
    expect(pathCovers("database", "database")).toBe(true);
    expect(pathCovers("database", "src")).toBe(false);
  });
});

describe("nukeNet", () => {
  it("auto-advances from idle to ready", () => {
    const marking = autoAdvance(nukeNet, { ...nukeNet.initialMarking });
    expect(marking.idle).toBe(0);
    expect(marking.ready).toBe(1);
  });

  it("regular bash is free", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const result = await handleToolCall(makeBashEvent("bun test"), makeCtx(), nukeNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.ready).toBe(1);
  });

  it("destructive bash blocked without backup", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const result = await handleToolCall(makeBashEvent("rm -rf build/"), makeCtx(), nukeNet, state);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("destructive") });
  });

  it("backup is deferred — allowed but doesn't fire until result", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const backupEvent = makeBashEvent("git stash");

    const result = await handleToolCall(backupEvent, makeCtx(), nukeNet, state);
    expect(result).toBeUndefined(); // allowed
    // But marking hasn't changed yet — transition is deferred
    expect(state.marking.ready).toBe(1);
    expect(state.marking.backedUp).toBe(0);
    expect(state.pending.size).toBe(1);
  });

  it("backup fires on successful tool_result", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const backupEvent = makeBashEvent("git stash");

    await handleToolCall(backupEvent, makeCtx(), nukeNet, state);
    handleToolResult(makeResult(backupEvent, false), nukeNet, state);

    expect(state.marking.ready).toBe(0);
    expect(state.marking.backedUp).toBe(1);
    expect(state.pending.size).toBe(0);
  });

  it("backup does NOT fire on failed tool_result", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const backupEvent = makeBashEvent("git stash");

    await handleToolCall(backupEvent, makeCtx(), nukeNet, state);
    handleToolResult(makeResult(backupEvent, true), nukeNet, state);

    // Marking unchanged — backup failed
    expect(state.marking.ready).toBe(1);
    expect(state.marking.backedUp).toBe(0);
  });

  it("full cycle: backup → destroy → back to ready", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const ctx = makeCtx();

    // Backup
    const backupEvent = makeBashEvent("git stash");
    await handleToolCall(backupEvent, ctx, nukeNet, state);
    handleToolResult(makeResult(backupEvent, false), nukeNet, state);
    expect(state.marking.backedUp).toBe(1);

    // Destroy
    const destroyResult = await handleToolCall(
      makeBashEvent("rm -rf build/"),
      ctx,
      nukeNet,
      state,
    );
    expect(destroyResult).toBeUndefined();
    expect(state.marking.ready).toBe(1);
    expect(state.marking.backedUp).toBe(0);
  });

  it("path mismatch: backup src/ then try to rm build/ → blocked", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const ctx = makeCtx();

    // Backup src/
    const backupEvent = makeBashEvent("cp -r src/ /tmp/src-bak");
    await handleToolCall(backupEvent, ctx, nukeNet, state);
    handleToolResult(makeResult(backupEvent, false), nukeNet, state);
    expect(state.marking.backedUp).toBe(1);

    // Try to destroy build/ — path not covered
    const result = await handleToolCall(makeBashEvent("rm -rf build/"), ctx, nukeNet, state);
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("not covered"),
    });
    // Marking unchanged — destroy was blocked
    expect(state.marking.backedUp).toBe(1);
  });

  it("path match: backup src/ then rm src/generated/ → allowed", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const ctx = makeCtx();

    const backupEvent = makeBashEvent("cp -r src/ /tmp/src-bak");
    await handleToolCall(backupEvent, ctx, nukeNet, state);
    handleToolResult(makeResult(backupEvent, false), nukeNet, state);

    const result = await handleToolCall(
      makeBashEvent("rm -rf src/generated/"),
      ctx,
      nukeNet,
      state,
    );
    expect(result).toBeUndefined();
    expect(state.marking.ready).toBe(1);
  });

  it("git stash covers any destructive target", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const ctx = makeCtx();

    const backupEvent = makeBashEvent("git stash");
    await handleToolCall(backupEvent, ctx, nukeNet, state);
    handleToolResult(makeResult(backupEvent, false), nukeNet, state);

    const result = await handleToolCall(
      makeBashEvent("rm -rf anything/at/all"),
      ctx,
      nukeNet,
      state,
    );
    expect(result).toBeUndefined();
  });

  it("each destroy consumes its backup — second destroy needs new backup", async () => {
    const state = gs(autoAdvance(nukeNet, { ...nukeNet.initialMarking }));
    const ctx = makeCtx();

    // First backup + destroy
    const b1 = makeBashEvent("git stash");
    await handleToolCall(b1, ctx, nukeNet, state);
    handleToolResult(makeResult(b1, false), nukeNet, state);
    await handleToolCall(makeBashEvent("rm -rf build/"), ctx, nukeNet, state);
    expect(state.marking.ready).toBe(1);

    // Second destroy without backup → blocked
    const blocked = await handleToolCall(
      makeBashEvent("rm -rf dist/"),
      ctx,
      nukeNet,
      state,
    );
    expect(blocked).toEqual({ block: true, reason: expect.stringContaining("destructive") });

    // Second backup + destroy → works
    const b2 = makeBashEvent("git stash");
    await handleToolCall(b2, ctx, nukeNet, state);
    handleToolResult(makeResult(b2, false), nukeNet, state);
    const allowed = await handleToolCall(makeBashEvent("rm -rf dist/"), ctx, nukeNet, state);
    expect(allowed).toBeUndefined();
  });
});
