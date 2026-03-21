import { describe, expect, it } from "bun:test";
import { createPetriflowGate, defineSkillNet } from "./index.js";
import { safeCodingNet } from "./nets/safe-coding.js";

// ---------------------------------------------------------------------------
// Helpers — simulate Agent SDK hook invocations
// ---------------------------------------------------------------------------

const signal = AbortSignal.timeout(5000);

function preToolUseInput(toolName: string, toolInput: Record<string, unknown> = {}) {
  return {
    session_id: "test-session",
    cwd: "/tmp",
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
  };
}

function postToolUseInput(toolName: string, toolInput: Record<string, unknown> = {}) {
  return {
    session_id: "test-session",
    cwd: "/tmp",
    hook_event_name: "PostToolUse",
    tool_name: toolName,
    tool_input: toolInput,
  };
}

function postToolUseFailureInput(toolName: string, toolInput: Record<string, unknown> = {}) {
  return {
    session_id: "test-session",
    cwd: "/tmp",
    hook_event_name: "PostToolUseFailure",
    tool_name: toolName,
    tool_input: toolInput,
  };
}

function getPreHook(gate: ReturnType<typeof createPetriflowGate>) {
  return gate.hooks["PreToolUse"]![0]!.hooks[0]!;
}

function getPostHook(gate: ReturnType<typeof createPetriflowGate>) {
  return gate.hooks["PostToolUse"]![0]!.hooks[0]!;
}

function getPostFailureHook(gate: ReturnType<typeof createPetriflowGate>) {
  return gate.hooks["PostToolUseFailure"]![0]!.hooks[0]!;
}

// ---------------------------------------------------------------------------
// createPetriflowGate
// ---------------------------------------------------------------------------

describe("createPetriflowGate", () => {
  it("returns hooks, manager, systemPrompt, formatStatus", () => {
    const gate = createPetriflowGate([safeCodingNet]);

    expect(gate.hooks).toBeDefined();
    expect(gate.hooks["PreToolUse"]).toHaveLength(1);
    expect(gate.hooks["PostToolUse"]).toHaveLength(1);
    expect(gate.hooks["PostToolUseFailure"]).toHaveLength(1);
    expect(gate.manager).toBeDefined();
    expect(typeof gate.systemPrompt).toBe("function");
    expect(typeof gate.formatStatus).toBe("function");
  });

  it("systemPrompt returns a non-empty string", () => {
    const gate = createPetriflowGate([safeCodingNet]);
    expect(gate.systemPrompt().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PreToolUse — free tools
// ---------------------------------------------------------------------------

describe("PreToolUse — free tools", () => {
  it("allows free tools without blocking", async () => {
    const gate = createPetriflowGate([safeCodingNet]);
    const hook = getPreHook(gate);

    for (const tool of ["Read", "Glob", "Grep", "WebSearch"]) {
      const result = await hook(preToolUseInput(tool), `tc-${tool}`, { signal });
      expect(result).toEqual({});
    }
  });
});

// ---------------------------------------------------------------------------
// PreToolUse — gated tools
// ---------------------------------------------------------------------------

describe("PreToolUse — gated tools", () => {
  it("allows gated tools when net is in ready state", async () => {
    const gate = createPetriflowGate([safeCodingNet]);
    const hook = getPreHook(gate);

    for (const tool of ["Write", "Edit", "Bash", "WebFetch", "Agent"]) {
      const result = await hook(preToolUseInput(tool), `tc-${tool}`, { signal });
      expect(result).toEqual({});
    }
  });
});

// ---------------------------------------------------------------------------
// PreToolUse — blocked tools
// ---------------------------------------------------------------------------

describe("PreToolUse — blocked tools", () => {
  it("blocks tools with no enabled transition", async () => {
    const blockNet = defineSkillNet({
      name: "block-bash",
      places: ["idle", "locked"],
      terminalPlaces: [],
      freeTools: ["Read"],
      initialMarking: { idle: 1, locked: 0 },
      transitions: [
        { name: "bashBlocked", type: "auto" as const, inputs: ["locked"], outputs: ["locked"], tools: ["Bash"] },
      ],
    });

    const gate = createPetriflowGate([blockNet]);
    const hook = getPreHook(gate);

    const result = await hook(preToolUseInput("Bash"), "tc-bash", { signal });

    expect(result).toHaveProperty("hookSpecificOutput");
    const output = result["hookSpecificOutput"] as Record<string, unknown>;
    expect(output["hookEventName"]).toBe("PreToolUse");
    expect(output["permissionDecision"]).toBe("deny");
    expect(typeof output["permissionDecisionReason"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// PostToolUse — deferred resolution
// ---------------------------------------------------------------------------

describe("PostToolUse — deferred resolution", () => {
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

  it("fires deferred transition on successful result", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const preHook = getPreHook(gate);
    const postHook = getPostHook(gate);

    // Allow the deferred call
    await preHook(preToolUseInput("Backup"), "tc-backup", { signal });

    // Marking still at ready (deferred hasn't fired)
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 1, backedUp: 0,
    });

    // Resolve successfully
    await postHook(postToolUseInput("Backup"), "tc-backup", { signal });

    // Net advanced
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 0, backedUp: 1,
    });
  });

  it("does not fire deferred transition on failure", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const preHook = getPreHook(gate);
    const postFailureHook = getPostFailureHook(gate);

    await preHook(preToolUseInput("Backup"), "tc-backup", { signal });

    // Resolve with error
    await postFailureHook(postToolUseFailureInput("Backup"), "tc-backup", { signal });

    // Marking unchanged
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({
      idle: 0, ready: 1, backedUp: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// State persists in-process (no serialization needed)
// ---------------------------------------------------------------------------

describe("in-process state", () => {
  it("manager state persists across multiple hook calls", async () => {
    const deferredNet = defineSkillNet({
      name: "sequential",
      places: ["step1", "step2", "step3"],
      terminalPlaces: ["step3"],
      freeTools: [],
      initialMarking: { step1: 1, step2: 0, step3: 0 },
      transitions: [
        { name: "first", type: "auto" as const, inputs: ["step1"], outputs: ["step2"], tools: ["ToolA"], deferred: true },
        { name: "second", type: "auto" as const, inputs: ["step2"], outputs: ["step3"], tools: ["ToolB"] },
      ],
    });

    const gate = createPetriflowGate([deferredNet]);
    const preHook = getPreHook(gate);
    const postHook = getPostHook(gate);

    // Step 1: call ToolA (deferred)
    await preHook(preToolUseInput("ToolA"), "tc-1", { signal });
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({ step1: 1, step2: 0, step3: 0 });

    // Step 2: ToolA succeeds → net advances to step2
    await postHook(postToolUseInput("ToolA"), "tc-1", { signal });
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({ step1: 0, step2: 1, step3: 0 });

    // Step 3: call ToolB → net advances to step3
    await preHook(preToolUseInput("ToolB"), "tc-2", { signal });
    expect(gate.manager.getActiveNets()[0]!.state.marking).toEqual({ step1: 0, step2: 0, step3: 1 });
  });
});

// ---------------------------------------------------------------------------
// Unknown tools
// ---------------------------------------------------------------------------

describe("unknown tools", () => {
  it("allows tools with no jurisdiction (nets abstain)", async () => {
    const gate = createPetriflowGate([safeCodingNet]);
    const hook = getPreHook(gate);

    const result = await hook(preToolUseInput("UnknownTool"), "tc-unknown", { signal });
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Multi-net composition
// ---------------------------------------------------------------------------

describe("multi-net composition", () => {
  it("blocks when any net denies", async () => {
    const allowNet = defineSkillNet({
      name: "allow-all",
      places: ["open"],
      terminalPlaces: [],
      freeTools: ["Bash"],
      initialMarking: { open: 1 },
      transitions: [],
    });

    const blockNet = defineSkillNet({
      name: "block-bash",
      places: ["idle", "locked"],
      terminalPlaces: [],
      freeTools: [],
      initialMarking: { idle: 1, locked: 0 },
      transitions: [
        { name: "bashBlocked", type: "auto" as const, inputs: ["locked"], outputs: ["locked"], tools: ["Bash"] },
      ],
    });

    const gate = createPetriflowGate([allowNet, blockNet]);
    const hook = getPreHook(gate);

    const result = await hook(preToolUseInput("Bash"), "tc-bash", { signal });
    const output = result["hookSpecificOutput"] as Record<string, unknown>;
    expect(output["permissionDecision"]).toBe("deny");
  });
});
