import { describe, expect, it } from "bun:test";
import { defineSkillNet } from "../types.js";
import { createGateManager } from "../manager.js";
import type { GateContext } from "../events.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): GateContext {
  return { hasUI: false, confirm: async () => false };
}

// A simple sequence net: require "test" before "deploy"
const sequenceNet = defineSkillNet({
  name: "require-test-before-deploy",
  places: ["ready", "tested"],
  terminalPlaces: [],
  freeTools: ["read"],
  initialMarking: { ready: 1, tested: 0 },
  transitions: [
    { name: "run-test", type: "auto" as const, inputs: ["ready"], outputs: ["tested"], tools: ["test"], deferred: true },
    { name: "run-deploy", type: "auto" as const, inputs: ["tested"], outputs: ["tested"], tools: ["deploy"] },
  ],
});

// A multi-step net: A → B → C
const multiStepNet = defineSkillNet({
  name: "multi-step",
  places: ["p0", "p1", "p2"],
  terminalPlaces: [],
  freeTools: [],
  initialMarking: { p0: 1, p1: 0, p2: 0 },
  transitions: [
    { name: "step-a", type: "auto" as const, inputs: ["p0"], outputs: ["p1"], tools: ["toolA"], deferred: true },
    { name: "step-b", type: "auto" as const, inputs: ["p1"], outputs: ["p2"], tools: ["toolB"], deferred: true },
    { name: "step-c", type: "auto" as const, inputs: ["p2"], outputs: ["p2"], tools: ["toolC"] },
  ],
});

// Net with a toolMapper
const mapperNet = defineSkillNet({
  name: "mapper-net",
  places: ["idle", "backed-up"],
  terminalPlaces: [],
  freeTools: [],
  initialMarking: { idle: 1, "backed-up": 0 },
  toolMapper: (event) => {
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      if (event.input.command.includes("cp")) return "backup";
      if (event.input.command.includes("rm")) return "delete";
    }
    return event.toolName;
  },
  transitions: [
    { name: "do-backup", type: "auto" as const, inputs: ["idle"], outputs: ["backed-up"], tools: ["backup"], deferred: true },
    { name: "do-delete", type: "auto" as const, inputs: ["backed-up"], outputs: ["backed-up"], tools: ["delete"] },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("manager.replay", () => {
  it("advances marking through a sequence", () => {
    const manager = createGateManager([sequenceNet]);
    const ctx = makeCtx();

    // Before replay, deploy should be blocked
    const before = manager.getActiveNets()[0]!;
    expect(before.state.marking.ready).toBe(1);
    expect(before.state.marking.tested).toBe(0);

    manager.replay([{ toolName: "test", isError: false }]);

    const after = manager.getActiveNets()[0]!;
    expect(after.state.marking.ready).toBe(0);
    expect(after.state.marking.tested).toBe(1);
  });

  it("skips failed tool results", () => {
    const manager = createGateManager([sequenceNet]);

    manager.replay([{ toolName: "test", isError: true }]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
    expect(state.state.marking.tested).toBe(0);
  });

  it("accepts string[] shorthand for successful tools", () => {
    const manager = createGateManager([sequenceNet]);

    manager.replay(["test"]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.tested).toBe(1);
  });

  it("is idempotent — skips transitions that can't fire", () => {
    const manager = createGateManager([sequenceNet]);

    // Replay test twice — second one should be a no-op since ready:0
    manager.replay(["test", "test"]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(0);
    expect(state.state.marking.tested).toBe(1);
  });

  it("replays multi-step sequences", () => {
    const manager = createGateManager([multiStepNet]);

    manager.replay(["toolA", "toolB"]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.p0).toBe(0);
    expect(state.state.marking.p1).toBe(0);
    expect(state.state.marking.p2).toBe(1);
  });

  it("skips unknown tools silently", () => {
    const manager = createGateManager([sequenceNet]);

    manager.replay(["unknown-tool", "test"]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.tested).toBe(1);
  });

  it("skips free tools silently", () => {
    const manager = createGateManager([sequenceNet]);

    manager.replay(["read", "test"]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.tested).toBe(1);
  });

  it("works with toolMapper when input is provided", () => {
    const manager = createGateManager([mapperNet]);

    manager.replay([
      { toolName: "bash", input: { command: "cp file backup" }, isError: false },
    ]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking["backed-up"]).toBe(1);
  });

  it("works across multiple composed nets", () => {
    const manager = createGateManager([sequenceNet, multiStepNet]);

    manager.replay(["test", "toolA", "toolB"]);

    const nets = manager.getActiveNets();
    expect(nets[0]!.state.marking.tested).toBe(1);
    expect(nets[1]!.state.marking.p2).toBe(1);
  });

  it("replayed state allows subsequent gated calls", async () => {
    const manager = createGateManager([sequenceNet]);
    const ctx = makeCtx();

    // Without replay, deploy is blocked
    const blocked = await manager.handleToolCall(
      { toolCallId: "c1", toolName: "deploy", input: {} },
      ctx,
    );
    expect(blocked?.block).toBe(true);

    // Replay test completion
    manager.replay(["test"]);

    // Now deploy should be allowed
    const allowed = await manager.handleToolCall(
      { toolCallId: "c2", toolName: "deploy", input: {} },
      ctx,
    );
    expect(allowed).toBeUndefined();
  });

  it("handles empty entries array", () => {
    const manager = createGateManager([sequenceNet]);
    manager.replay([]);

    const state = manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
  });

  it("works with registry mode", () => {
    const manager = createGateManager({
      registry: { seq: sequenceNet, multi: multiStepNet },
      active: ["seq"],
    });

    manager.replay(["test"]);

    const nets = manager.getActiveNets();
    expect(nets[0]!.state.marking.tested).toBe(1);
  });
});
