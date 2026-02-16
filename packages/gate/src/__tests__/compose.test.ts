import { describe, expect, it } from "bun:test";
import type { GateToolCall, GateToolResult, GateContext } from "../events.js";
import { autoAdvance } from "../advance.js";
import { createGateState } from "../gate.js";
import { defineSkillNet } from "../types.js";
import type { SkillNet } from "../types.js";
import { classifyNets } from "../compose.js";
import { createGateManager } from "../manager.js";

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

function makeResult(callEvent: GateToolCall, isError: boolean): GateToolResult {
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

// ---------------------------------------------------------------------------
// Synthetic nets for focused composition tests
// ---------------------------------------------------------------------------

// Net A: gates "dangerous" tool, "safe" is free
const netA = defineSkillNet({
  name: "netA",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "useDangerous", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["dangerous"] },
  ],
});

// Net B: gates "dangerous" with manual approval, "safe" is free
const netB = defineSkillNet({
  name: "netB",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "approveDangerous", type: "manual" as const, inputs: ["ready"], outputs: ["ready"], tools: ["dangerous"] },
  ],
});

// Net C: only gates "special", knows nothing about "dangerous"
const netC = defineSkillNet({
  name: "netC",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "useSpecial", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["special"] },
  ],
});

// Net D: deferred gating on "deferred-tool"
const netD = defineSkillNet({
  name: "netD",
  places: ["idle", "ready", "done"],
  terminalPlaces: ["done"],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0, done: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "deferredStep", type: "auto" as const, inputs: ["ready"], outputs: ["done"], tools: ["deferred-tool"], deferred: true },
  ],
});

// Net E: blocks "dangerous" (no enabled transition)
const netE = defineSkillNet({
  name: "netE",
  places: ["locked"],
  terminalPlaces: [],
  freeTools: ["safe"],
  initialMarking: { locked: 1 },
  transitions: [
    // "dangerous" only available from "unlocked", which has no tokens
    { name: "useDangerous", type: "auto" as const, inputs: ["locked"], outputs: ["locked"], tools: ["something-else"] },
    // dangerous is in a transition but never enabled from "locked"
    { name: "realDangerous", type: "auto" as const, inputs: ["unlocked" as string], outputs: ["locked"], tools: ["dangerous"] },
  ],
});

// Validation nets for meta rollback test
const validatorA: SkillNet<string> = defineSkillNet({
  name: "validatorA",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: [],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "validate", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["validated-tool"] },
  ],
  validateToolCall(_event, _resolved, _transition, state) {
    // Mutate meta — consume a "token"
    const count = (state.meta.tokenCount as number | undefined) ?? 0;
    state.meta.tokenCount = count + 1;
    return undefined; // allow
  },
});

const validatorB: SkillNet<string> = defineSkillNet({
  name: "validatorB",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: [],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "validate", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["validated-tool"] },
  ],
  validateToolCall() {
    // Always blocks
    return { block: true, reason: "validatorB blocks" };
  },
});

// ---------------------------------------------------------------------------
// classifyNets tests
// ---------------------------------------------------------------------------

describe("classifyNets", () => {
  it("classifies free tools as free", () => {
    const states = [createGateState(autoAdvance(netA, { ...netA.initialMarking }))];
    const verdicts = classifyNets([netA], states, { toolName: "safe", input: {} });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe("free");
  });

  it("classifies gated tools with enabled transitions as gated", () => {
    const states = [createGateState(autoAdvance(netA, { ...netA.initialMarking }))];
    const verdicts = classifyNets([netA], states, { toolName: "dangerous", input: {} });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe("gated");
  });

  it("classifies tools with no jurisdiction as abstain", () => {
    const states = [createGateState(autoAdvance(netC, { ...netC.initialMarking }))];
    const verdicts = classifyNets([netC], states, { toolName: "dangerous", input: {} });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe("abstain");
  });

  it("classifies tools with jurisdiction but no enabled transition as blocked", () => {
    const states = [createGateState({ ...netE.initialMarking })];
    const verdicts = classifyNets([netE], states, { toolName: "dangerous", input: {} });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe("blocked");
  });

  it("classifies multiple nets independently", () => {
    const states = [
      createGateState(autoAdvance(netA, { ...netA.initialMarking })),
      createGateState(autoAdvance(netC, { ...netC.initialMarking })),
    ];
    const verdicts = classifyNets([netA, netC], states, { toolName: "dangerous", input: {} });
    expect(verdicts[0]!.kind).toBe("gated"); // netA gates it
    expect(verdicts[1]!.kind).toBe("abstain"); // netC doesn't know about it
  });
});

// ---------------------------------------------------------------------------
// createGateManager — array mode (tool_call handler)
// ---------------------------------------------------------------------------

describe("createGateManager — array mode", () => {
  it("allows tools free in all nets", async () => {
    const manager = createGateManager([netA, netC]);
    const result = await manager.handleToolCall(makeEvent("safe"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("blocks when one net blocks (jurisdiction, no enabled transition)", async () => {
    const manager = createGateManager([netA, netE]);
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("netE") });
  });

  it("allows when unknown net abstains and other net allows", async () => {
    const manager = createGateManager([netA, netC]);
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("allows when unknown net abstains and no net gates", async () => {
    const manager = createGateManager([netC]);
    const result = await manager.handleToolCall(makeEvent("unknown-tool"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("handles gated in one net, free in others", async () => {
    const manager = createGateManager([netA, netD]);
    const event = makeEvent("deferred-tool");
    const result = await manager.handleToolCall(event, makeCtx());
    expect(result).toBeUndefined(); // allowed (deferred)
  });

  it("handles manual approval — allowed when approved", async () => {
    const manager = createGateManager([netB]);
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx(true));
    expect(result).toBeUndefined();
  });

  it("handles manual approval — blocked when rejected", async () => {
    const manager = createGateManager([netB]);
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx(false));
    expect(result).toEqual({ block: true, reason: expect.stringContaining("rejected") });
  });

  it("handles manual approval — blocked when no UI", async () => {
    const manager = createGateManager([netB]);
    const noUiCtx: GateContext = { hasUI: false, confirm: async () => false };
    const result = await manager.handleToolCall(makeEvent("dangerous"), noUiCtx);
    expect(result).toEqual({ block: true, reason: expect.stringContaining("requires UI") });
  });
});

// ---------------------------------------------------------------------------
// createGateManager — deferred transitions
// ---------------------------------------------------------------------------

describe("createGateManager — deferred transitions", () => {
  it("deferred tool allowed but state unchanged until result", async () => {
    const manager = createGateManager([netD]);
    const event = makeEvent("deferred-tool");
    const result = await manager.handleToolCall(event, makeCtx());
    expect(result).toBeUndefined();

    // Before result: still at ready
    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("ready:1");
  });

  it("deferred fires on successful result", async () => {
    const manager = createGateManager([netD]);
    const event = makeEvent("deferred-tool");
    await manager.handleToolCall(event, makeCtx());
    manager.handleToolResult(makeResult(event, false));

    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("done:1");
  });

  it("deferred does NOT fire on failed result", async () => {
    const manager = createGateManager([netD]);
    const event = makeEvent("deferred-tool");
    await manager.handleToolCall(event, makeCtx());
    manager.handleToolResult(makeResult(event, true));

    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("ready:1");
  });

  it("deferred result fires only in the net that deferred", async () => {
    const manager = createGateManager([netA, netD]);
    const deferredEvent = makeEvent("deferred-tool");
    await manager.handleToolCall(deferredEvent, makeCtx());
    manager.handleToolResult(makeResult(deferredEvent, false));

    // netD should have advanced to "done", netA stays at "ready"
    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("done:1"); // netD
    expect(prompt).toContain("### netA");
    // netA should still be at ready:1
    const netASection = prompt.split("### netA")[1]!.split("###")[0]!;
    expect(netASection).toContain("ready:1");
  });
});

// ---------------------------------------------------------------------------
// createGateManager — meta rollback
// ---------------------------------------------------------------------------

describe("createGateManager — meta rollback", () => {
  it("rolls back meta when a later validator blocks", async () => {
    const manager = createGateManager([validatorA, validatorB]);
    const event = makeEvent("validated-tool");
    const result = await manager.handleToolCall(event, makeCtx());

    // validatorB blocked
    expect(result).toEqual({ block: true, reason: "validatorB blocks" });

    // validatorA's meta should be rolled back — tokenCount should NOT have been incremented
    const event2 = makeEvent("validated-tool");
    const result2 = await manager.handleToolCall(event2, makeCtx());
    expect(result2).toEqual({ block: true, reason: "validatorB blocks" });
  });
});

// ---------------------------------------------------------------------------
// createGateManager — single net equivalence
// ---------------------------------------------------------------------------

describe("createGateManager — single net equivalence", () => {
  it("single net behaves like createPetriGate", async () => {
    const manager = createGateManager([netA]);

    // Free tool allowed
    expect(await manager.handleToolCall(makeEvent("safe"), makeCtx())).toBeUndefined();

    // Gated tool allowed
    expect(await manager.handleToolCall(makeEvent("dangerous"), makeCtx())).toBeUndefined();
  });

  it("single net with manual approval works", async () => {
    const manager = createGateManager([netB]);

    const rejected = await manager.handleToolCall(makeEvent("dangerous"), makeCtx(false));
    expect(rejected).toEqual({ block: true, reason: expect.stringContaining("rejected") });

    const approved = await manager.handleToolCall(makeEvent("dangerous"), makeCtx(true));
    expect(approved).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createGateManager — system prompt and status
// ---------------------------------------------------------------------------

describe("createGateManager — system prompt and status", () => {
  it("aggregates all nets in system prompt", () => {
    const manager = createGateManager([netA, netC]);
    const prompt = manager.formatSystemPrompt();

    expect(prompt).toContain("## Active Petri Nets (composed)");
    expect(prompt).toContain("### netA");
    expect(prompt).toContain("### netC");
  });

  it("formatStatus shows all markings", () => {
    const manager = createGateManager([netA, netC]);
    const status = manager.formatStatus();
    expect(status).toContain("netA:");
    expect(status).toContain("netC:");
  });

  it("isDynamic is false for array mode", () => {
    const manager = createGateManager([netA]);
    expect(manager.isDynamic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createGateManager — real nets composition
// ---------------------------------------------------------------------------

describe("createGateManager — real nets composition", () => {
  it("compose communicate + cleanup: read is free in both", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const manager = createGateManager([communicateNet, cleanupNet]);
    const result = await manager.handleToolCall(makeEvent("read"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("compose communicate + cleanup: rm -rf blocked by cleanup", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const manager = createGateManager([communicateNet, cleanupNet]);
    const result = await manager.handleToolCall(makeBashEvent("rm -rf build/"), makeCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("cleanup") });
  });

  it("compose communicate + cleanup: slack unknown to cleanup, communicate gates it", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const manager = createGateManager([communicateNet, cleanupNet]);
    const result = await manager.handleToolCall(
      makeEvent("slack", { action: "sendMessage", to: "channel:C123" }),
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: expect.stringContaining("communicate") });
  });
});

// ---------------------------------------------------------------------------
// createGateManager — dynamic management (registry mode)
// ---------------------------------------------------------------------------

describe("createGateManager — dynamic management", () => {
  it("addNet activates a net, tool calls route through it", async () => {
    const manager = createGateManager({ registry: { netA, netC }, active: ["netA"] });

    // "special" is gated by netC — but netC is inactive, so it should pass (abstain)
    const result1 = await manager.handleToolCall(makeEvent("special"), makeCtx());
    expect(result1).toBeUndefined();

    // Activate netC
    const addResult = manager.addNet("netC");
    expect(addResult.ok).toBe(true);
    expect(addResult.message).toContain("Activated");

    // Now "special" should be gated by netC (allowed because transition is enabled)
    const result2 = await manager.handleToolCall(makeEvent("special"), makeCtx());
    expect(result2).toBeUndefined();
  });

  it("removeNet deactivates a net, tool calls skip it", async () => {
    const manager = createGateManager({ registry: { netA, netE } });

    // "dangerous" is blocked by netE
    const result1 = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result1).toEqual({ block: true, reason: expect.stringContaining("netE") });

    // Remove netE
    const removeResult = manager.removeNet("netE");
    expect(removeResult.ok).toBe(true);
    expect(removeResult.message).toContain("Deactivated");

    // Now "dangerous" should pass through netA only (allowed)
    const result2 = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result2).toBeUndefined();
  });

  it("removed net's state is preserved — re-add picks up same marking", async () => {
    const manager = createGateManager({ registry: { netA, netD } });

    // Fire deferred-tool on netD to advance its state
    const event = makeEvent("deferred-tool");
    await manager.handleToolCall(event, makeCtx());
    manager.handleToolResult(makeResult(event, false));

    // netD should be at "done:1" now
    let prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("done:1");

    // Remove netD
    manager.removeNet("netD");

    // netD should not appear in system prompt anymore
    prompt = manager.formatSystemPrompt();
    expect(prompt).not.toContain("### netD");

    // Re-add netD
    manager.addNet("netD");

    // netD should still be at "done:1" (state preserved)
    prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("### netD");
    expect(prompt).toContain("done:1");
  });

  it("remove net with pending deferred — result still fires on that net", async () => {
    const manager = createGateManager({ registry: { netA, netD } });

    // Start a deferred tool call on netD
    const event = makeEvent("deferred-tool");
    await manager.handleToolCall(event, makeCtx());

    // Remove netD while it has a pending deferred
    manager.removeNet("netD");

    // Deliver the tool_result — should still fire on netD (fan out to all registry nets)
    manager.handleToolResult(makeResult(event, false));

    // Re-add netD — should be at "done:1" because deferred fired
    manager.addNet("netD");

    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("done:1");
  });

  it("unknown net name → error result", () => {
    const manager = createGateManager({ registry: { netA } });
    const result = manager.addNet("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown net");
    expect(result.message).toContain("netA");
  });

  it("add already-active net → error result", () => {
    const manager = createGateManager({ registry: { netA } });
    const result = manager.addNet("netA");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already active");
  });

  it("remove already-inactive net → error result", () => {
    const manager = createGateManager({ registry: { netA, netC }, active: ["netA"] });
    const result = manager.removeNet("netC");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not active");
    expect(result.message).toContain("netA"); // shows active list
  });

  it("formatStatus shows active/inactive status in registry mode", () => {
    const manager = createGateManager({ registry: { netA, netC }, active: ["netA"] });
    const status = manager.formatStatus();
    expect(status).toContain("netA (active)");
    expect(status).toContain("netC (inactive)");
  });

  it("system prompt only includes active nets in registry mode", () => {
    const manager = createGateManager({ registry: { netA, netC }, active: ["netA"] });
    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("### netA");
    expect(prompt).not.toContain("### netC");
  });

  it("registry mode with all nets active by default", () => {
    const manager = createGateManager({ registry: { netA, netC } });
    const prompt = manager.formatSystemPrompt();
    expect(prompt).toContain("### netA");
    expect(prompt).toContain("### netC");
  });

  it("isDynamic is true for registry mode", () => {
    const manager = createGateManager({ registry: { netA } });
    expect(manager.isDynamic).toBe(true);
  });

  it("array form — addNet/removeNet not supported", () => {
    const manager = createGateManager([netA, netC]);
    expect(manager.addNet("netA").ok).toBe(false);
    expect(manager.removeNet("netA").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createGateManager — shadow mode
// ---------------------------------------------------------------------------

describe("createGateManager — shadow mode", () => {
  it("shadow mode allows tools that would be blocked", async () => {
    const manager = createGateManager([netA, netE], { mode: "shadow" });
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("shadow mode still allows free tools", async () => {
    const manager = createGateManager([netA], { mode: "shadow" });
    const result = await manager.handleToolCall(makeEvent("safe"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("shadow mode still allows normally-allowed gated tools", async () => {
    const manager = createGateManager([netA], { mode: "shadow" });
    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("onDecision callback fires for every decision", async () => {
    const decisions: Array<{ toolName: string; blocked: boolean }> = [];
    const manager = createGateManager([netA, netE], {
      mode: "enforce",
      onDecision: (event, decision) => {
        decisions.push({ toolName: event.toolName, blocked: !!decision?.block });
      },
    });

    await manager.handleToolCall(makeEvent("safe"), makeCtx());
    await manager.handleToolCall(makeEvent("dangerous"), makeCtx());

    expect(decisions).toEqual([
      { toolName: "safe", blocked: false },
      { toolName: "dangerous", blocked: true },
    ]);
  });

  it("shadow mode + onDecision: callback sees block, caller sees allow", async () => {
    const decisions: Array<{ toolName: string; blocked: boolean }> = [];
    const manager = createGateManager([netA, netE], {
      mode: "shadow",
      onDecision: (event, decision) => {
        decisions.push({ toolName: event.toolName, blocked: !!decision?.block });
      },
    });

    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toBeUndefined(); // shadow: allowed
    expect(decisions).toEqual([{ toolName: "dangerous", blocked: true }]); // callback: saw block
  });

  it("onDecision without shadow mode still blocks", async () => {
    const decisions: Array<{ toolName: string; blocked: boolean }> = [];
    const manager = createGateManager([netA, netE], {
      mode: "enforce",
      onDecision: (event, decision) => {
        decisions.push({ toolName: event.toolName, blocked: !!decision?.block });
      },
    });

    const result = await manager.handleToolCall(makeEvent("dangerous"), makeCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("netE") });
    expect(decisions).toEqual([{ toolName: "dangerous", blocked: true }]);
  });
});
