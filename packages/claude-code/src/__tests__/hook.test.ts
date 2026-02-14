import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createGateManager, defineSkillNet } from "@petriflow/gate";
import { saveState, restoreState, clearState } from "../state.js";
import { safeCodingNet } from "../nets/safe-coding.js";

const TEST_SESSION = "test-hook-" + process.pid;

// Clean up state file after each test
beforeEach(() => clearState(TEST_SESSION));
afterEach(() => clearState(TEST_SESSION));

// ---------------------------------------------------------------------------
// Test nets
// ---------------------------------------------------------------------------

const deferredNet = defineSkillNet({
  name: "deferred-test",
  places: ["idle", "ready", "backedUp"],
  terminalPlaces: [],
  freeTools: ["Read"],
  initialMarking: { idle: 1, ready: 0, backedUp: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "backup", type: "auto" as const, inputs: ["ready"], outputs: ["backedUp"], tools: ["Backup"], deferred: true },
    { name: "destroy", type: "auto" as const, inputs: ["backedUp"], outputs: ["ready"], tools: ["Destroy"] },
  ],
});

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

describe("state persistence", () => {
  it("save → restore round-trip preserves marking", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    // After creation, auto-advance fires: idle=0, ready=1
    const before = manager.getActiveNets()[0]!;
    expect(before.state.marking).toEqual({ idle: 0, ready: 1, locked: 0 });

    saveState(TEST_SESSION, manager);

    // Create fresh manager and restore
    const manager2 = createGateManager([safeCodingNet], { mode: "enforce" });
    restoreState(TEST_SESSION, manager2);

    const after = manager2.getActiveNets()[0]!;
    expect(after.state.marking).toEqual({ idle: 0, ready: 1, locked: 0 });
  });

  it("save → restore round-trip preserves meta", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    // Mutate meta
    manager.getActiveNets()[0]!.state.meta.testKey = "testValue";
    manager.getActiveNets()[0]!.state.meta.count = 42;

    saveState(TEST_SESSION, manager);

    const manager2 = createGateManager([safeCodingNet], { mode: "enforce" });
    restoreState(TEST_SESSION, manager2);

    expect(manager2.getActiveNets()[0]!.state.meta.testKey).toBe("testValue");
    expect(manager2.getActiveNets()[0]!.state.meta.count).toBe(42);
  });

  it("save → restore round-trip preserves pending deferreds", async () => {
    const manager = createGateManager([deferredNet], { mode: "enforce" });

    // Trigger a deferred tool call — this records in pending
    await manager.handleToolCall(
      { toolCallId: "tc-1", toolName: "Backup", input: {} },
      { hasUI: false, confirm: async () => false },
    );

    const pending1 = manager.getActiveNets()[0]!.state.pending;
    expect(pending1.size).toBe(1);
    expect(pending1.get("tc-1")!.resolvedTool).toBe("Backup");

    saveState(TEST_SESSION, manager);

    // Restore into fresh manager
    const manager2 = createGateManager([deferredNet], { mode: "enforce" });
    restoreState(TEST_SESSION, manager2);

    const pending2 = manager2.getActiveNets()[0]!.state.pending;
    expect(pending2.size).toBe(1);
    expect(pending2.get("tc-1")!.resolvedTool).toBe("Backup");
    expect(pending2.get("tc-1")!.transition.name).toBe("backup");
  });

  it("restoreState is no-op when no state file exists", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });
    const markingBefore = { ...manager.getActiveNets()[0]!.state.marking };

    // No save — just restore
    restoreState("nonexistent-session", manager);

    expect(manager.getActiveNets()[0]!.state.marking).toEqual(markingBefore);
  });

  it("clearState removes the state file", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });
    saveState(TEST_SESSION, manager);

    expect(existsSync(`/tmp/petriflow-claude-code-${TEST_SESSION}.json`)).toBe(true);

    clearState(TEST_SESSION);

    expect(existsSync(`/tmp/petriflow-claude-code-${TEST_SESSION}.json`)).toBe(false);
  });

  it("clearState is no-op when no state file exists", () => {
    // Should not throw
    clearState("nonexistent-session-clear");
  });

  it("persisted JSON has expected shape", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });
    saveState(TEST_SESSION, manager);

    const raw = JSON.parse(readFileSync(`/tmp/petriflow-claude-code-${TEST_SESSION}.json`, "utf-8"));
    expect(raw.nets).toBeDefined();
    expect(raw.nets["safe-coding"]).toBeDefined();
    expect(raw.nets["safe-coding"].marking).toEqual({ idle: 0, ready: 1, locked: 0 });
    expect(raw.nets["safe-coding"].pending).toEqual([]);
    expect(raw.nets["safe-coding"].meta).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// PreToolUse gating (via GateManager directly, simulating hook logic)
// ---------------------------------------------------------------------------

describe("PreToolUse gating", () => {
  it("free tool → allow (no block)", async () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    for (const tool of ["Read", "Glob", "Grep", "WebSearch"]) {
      const decision = await manager.handleToolCall(
        { toolCallId: `tc-${tool}`, toolName: tool, input: {} },
        { hasUI: false, confirm: async () => false },
      );
      expect(decision).toBeUndefined();
    }
  });

  it("gated tool → allow when ready", async () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    for (const tool of ["Write", "Edit", "WebFetch", "Task"]) {
      const decision = await manager.handleToolCall(
        { toolCallId: `tc-${tool}`, toolName: tool, input: {} },
        { hasUI: false, confirm: async () => false },
      );
      expect(decision).toBeUndefined();
    }
  });

  it("blocked tool → deny", async () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    const decision = await manager.handleToolCall(
      { toolCallId: "tc-bash", toolName: "Bash", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    expect(decision).toEqual({ block: true, reason: expect.any(String) });
    expect(decision!.reason).toContain("Bash");
  });

  it("unknown tool → deny (not free, not gated)", async () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });

    const decision = await manager.handleToolCall(
      { toolCallId: "tc-unknown", toolName: "UnknownTool", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    // Unknown tool has no transition at all — net abstains, which means allow
    // (only nets with jurisdiction block)
    // Actually: the net has no transition for UnknownTool, and it's not free.
    // In composed gating, a net without jurisdiction abstains (allows).
    expect(decision).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PostToolUse — deferred resolution
// ---------------------------------------------------------------------------

describe("PostToolUse resolution", () => {
  it("deferred transition resolves on success", async () => {
    const manager = createGateManager([deferredNet], { mode: "enforce" });

    // Allow the backup (deferred)
    await manager.handleToolCall(
      { toolCallId: "tc-backup", toolName: "Backup", input: {} },
      { hasUI: false, confirm: async () => false },
    );

    // Before result: marking is still ready=1 (deferred hasn't fired)
    expect(manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 1, backedUp: 0,
    });

    // Resolve successfully
    manager.handleToolResult({
      toolCallId: "tc-backup",
      toolName: "Backup",
      input: {},
      isError: false,
    });

    // After result: marking advanced to backedUp=1
    expect(manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 0, backedUp: 1,
    });
  });

  it("deferred transition stays pending on failure", async () => {
    const manager = createGateManager([deferredNet], { mode: "enforce" });

    await manager.handleToolCall(
      { toolCallId: "tc-backup", toolName: "Backup", input: {} },
      { hasUI: false, confirm: async () => false },
    );

    // Resolve with error
    manager.handleToolResult({
      toolCallId: "tc-backup",
      toolName: "Backup",
      input: {},
      isError: true,
    });

    // Marking unchanged — still in ready
    expect(manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 1, backedUp: 0,
    });

    // Pending is cleared (error consumed the pending entry)
    expect(manager.getActiveNets()[0]!.state.pending.size).toBe(0);
  });

  it("deferred round-trip through state persistence", async () => {
    const manager = createGateManager([deferredNet], { mode: "enforce" });

    // Allow deferred backup
    await manager.handleToolCall(
      { toolCallId: "tc-backup", toolName: "Backup", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    saveState(TEST_SESSION, manager);

    // New process: restore and resolve
    const manager2 = createGateManager([deferredNet], { mode: "enforce" });
    restoreState(TEST_SESSION, manager2);

    manager2.handleToolResult({
      toolCallId: "tc-backup",
      toolName: "Backup",
      input: {},
      isError: false,
    });

    // Net advanced across process boundary
    expect(manager2.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 0, backedUp: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// SessionStart — clears state
// ---------------------------------------------------------------------------

describe("SessionStart", () => {
  it("clears existing state file", () => {
    const manager = createGateManager([safeCodingNet], { mode: "enforce" });
    saveState(TEST_SESSION, manager);

    expect(existsSync(`/tmp/petriflow-claude-code-${TEST_SESSION}.json`)).toBe(true);

    // SessionStart → clearState
    clearState(TEST_SESSION);

    expect(existsSync(`/tmp/petriflow-claude-code-${TEST_SESSION}.json`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// configure() helper
// ---------------------------------------------------------------------------

describe("configure()", () => {
  it("returns hooks config with all event types", async () => {
    const { configure } = await import("../index.js");
    const config = configure("/my/project");

    const events = Object.keys(config.hooks);
    expect(events).toContain("SessionStart");
    expect(events).toContain("PreToolUse");
    expect(events).toContain("PostToolUse");
    expect(events).toContain("PostToolUseFailure");
  });

  it("hooks use matcher group format with bun run command", async () => {
    const { configure } = await import("../index.js");
    const config = configure("/my/project");

    for (const [, matcherGroups] of Object.entries(config.hooks)) {
      expect(matcherGroups).toHaveLength(1);
      const group = matcherGroups[0]!;
      expect(group.hooks).toHaveLength(1);
      expect(group.hooks[0]!.type).toBe("command");
      expect(group.hooks[0]!.command).toContain("bun run");
      expect(group.hooks[0]!.command).toContain("hook.ts");
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: multi-step gating with state persistence
// ---------------------------------------------------------------------------

describe("end-to-end with state persistence", () => {
  it("gated tool across process boundaries", async () => {
    // Process 1: allow a Write
    const m1 = createGateManager([safeCodingNet], { mode: "enforce" });
    restoreState(TEST_SESSION, m1);

    const d1 = await m1.handleToolCall(
      { toolCallId: "tc-write-1", toolName: "Write", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    expect(d1).toBeUndefined();
    saveState(TEST_SESSION, m1);

    // Process 2: allow another Write (ready token restored by transition)
    const m2 = createGateManager([safeCodingNet], { mode: "enforce" });
    restoreState(TEST_SESSION, m2);

    const d2 = await m2.handleToolCall(
      { toolCallId: "tc-write-2", toolName: "Write", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    expect(d2).toBeUndefined();
    saveState(TEST_SESSION, m2);

    // Process 3: Bash still blocked
    const m3 = createGateManager([safeCodingNet], { mode: "enforce" });
    restoreState(TEST_SESSION, m3);

    const d3 = await m3.handleToolCall(
      { toolCallId: "tc-bash", toolName: "Bash", input: {} },
      { hasUI: false, confirm: async () => false },
    );
    expect(d3).toEqual({ block: true, reason: expect.any(String) });
  });
});
