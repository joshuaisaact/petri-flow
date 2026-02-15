import { describe, expect, it, mock } from "bun:test";
import type { SkillNet } from "@petriflow/gate";
import { createPetriflowGate } from "../index.js";
import { ToolCallBlockedError } from "../errors.js";

/** Helper to define test nets typed as SkillNet<string> (avoids contravariance issues) */
function testNet(n: SkillNet<string>): SkillNet<string> { return n; }

// ---------------------------------------------------------------------------
// Mock tool helper
// ---------------------------------------------------------------------------

function mockTool(fn?: (...args: any[]) => any) {
  const execute = fn ? mock(fn) : mock(async (input: any) => ({ ok: true, input }));
  return {
    description: "A test tool",
    parameters: { type: "object" as const, properties: {} },
    execute,
  };
}

function schemaOnlyTool() {
  return {
    description: "Schema-only tool",
    parameters: { type: "object" as const, properties: {} },
  };
}

const defaultOptions = { toolCallId: "call-1" };

// ---------------------------------------------------------------------------
// Test nets
// ---------------------------------------------------------------------------

const simpleNet = testNet({
  name: "simple",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["readData"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "write", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["writeData"] },
  ],
});

const blockingNet = testNet({
  name: "blocker",
  places: ["locked", "unlocked"],
  terminalPlaces: [],
  freeTools: ["readData"],
  initialMarking: { locked: 1, unlocked: 0 },
  transitions: [
    { name: "write", type: "auto" as const, inputs: ["unlocked"], outputs: ["locked"], tools: ["writeData"] },
  ],
});

const deferredNet = testNet({
  name: "deferred",
  places: ["idle", "ready", "backedUp"],
  terminalPlaces: [],
  freeTools: ["readData"],
  initialMarking: { idle: 1, ready: 0, backedUp: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "backup", type: "auto" as const, inputs: ["ready"], outputs: ["backedUp"], tools: ["backup"], deferred: true },
    { name: "destroy", type: "auto" as const, inputs: ["backedUp"], outputs: ["ready"], tools: ["destroy"] },
  ],
});

const manualNet = testNet({
  name: "manual",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["readData"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "write", type: "manual" as const, inputs: ["ready"], outputs: ["ready"], tools: ["writeData"] },
  ],
});

const multiToolNet = testNet({
  name: "multi-tool",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["readData"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "write", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["writeData"] },
    { name: "send", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["sendEmail"] },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Free tools", () => {
  it("free tool executes normally and returns result", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async () => "hello");
    const tools = gate.wrapTools({ readData: tool });

    const result = await tools.readData.execute({}, defaultOptions);
    expect(result).toBe("hello");
  });

  it("free tool with no gate interference (execute called exactly once)", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ readData: tool });

    await tools.readData.execute({}, defaultOptions);
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("multiple free tools all pass through independently", async () => {
    const net = testNet({
      name: "multi-free",
      places: ["idle", "ready"],
      terminalPlaces: [],
      freeTools: ["readData", "fetchData", "listData"],
      initialMarking: { idle: 1, ready: 0 },
      transitions: [
        { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
      ],
    });
    const gate = createPetriflowGate([net]);
    const read = mockTool(async () => "read");
    const fetch = mockTool(async () => "fetch");
    const list = mockTool(async () => "list");
    const tools = gate.wrapTools({ readData: read, fetchData: fetch, listData: list });

    expect(await tools.readData.execute({}, defaultOptions)).toBe("read");
    expect(await tools.fetchData.execute({}, defaultOptions)).toBe("fetch");
    expect(await tools.listData.execute({}, defaultOptions)).toBe("list");
  });
});

describe("Gated tools — allowed", () => {
  it("gated tool allowed when transition is enabled (ready state)", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async () => "written");
    const tools = gate.wrapTools({ writeData: tool });

    const result = await tools.writeData.execute({}, defaultOptions);
    expect(result).toBe("written");
  });

  it("gated tool execute receives original input and options unchanged", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async (input: any, opts: any) => ({ input, opts }));
    const tools = gate.wrapTools({ writeData: tool });

    const input = { key: "value" };
    const opts = { toolCallId: "call-42", extra: "data" };
    const result = await tools.writeData.execute(input, opts);

    expect(result.input).toEqual(input);
    expect(result.opts).toEqual(opts);
  });

  it("gated tool returns original execute result unmodified", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const complex = { nested: { data: [1, 2, 3] }, flag: true };
    const tool = mockTool(async () => complex);
    const tools = gate.wrapTools({ writeData: tool });

    const result = await tools.writeData.execute({}, defaultOptions);
    expect(result).toEqual(complex);
  });

  it("toolCallId from options is passed correctly to handleToolCall", async () => {
    const decisions: any[] = [];
    const gate = createPetriflowGate([simpleNet], {
      onDecision: (event) => decisions.push(event),
    });
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    await tools.writeData.execute({}, { toolCallId: "unique-id-123" });
    expect(decisions[0].toolCallId).toBe("unique-id-123");
  });
});

describe("Gated tools — blocked", () => {
  it("blocked tool throws ToolCallBlockedError", async () => {
    const gate = createPetriflowGate([blockingNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow(ToolCallBlockedError);
  });

  it("ToolCallBlockedError has correct toolName, toolCallId, reason properties", async () => {
    const gate = createPetriflowGate([blockingNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    try {
      await tools.writeData.execute({}, { toolCallId: "blocked-id" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolCallBlockedError);
      const err = e as ToolCallBlockedError;
      expect(err.toolName).toBe("writeData");
      expect(err.toolCallId).toBe("blocked-id");
      expect(err.reason).toBeDefined();
      expect(err.reason.length).toBeGreaterThan(0);
    }
  });

  it("original execute is never called when blocked", async () => {
    const gate = createPetriflowGate([blockingNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    try { await tools.writeData.execute({}, defaultOptions); } catch {}
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("tool blocked by net state (has jurisdiction but no enabled transition)", async () => {
    const gate = createPetriflowGate([blockingNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow(ToolCallBlockedError);
  });
});

describe("Deferred transitions", () => {
  it("deferred tool allowed immediately (execute runs)", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const tool = mockTool(async () => "backed-up");
    const tools = gate.wrapTools({ backup: tool });

    const result = await tools.backup.execute({}, defaultOptions);
    expect(result).toBe("backed-up");
  });

  it("successful deferred → net advances (backedUp state, destroy now available)", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const backupTool = mockTool(async () => "ok");
    const destroyTool = mockTool(async () => "destroyed");
    const tools = gate.wrapTools({ backup: backupTool, destroy: destroyTool });

    // backup succeeds → net advances ready → backedUp
    await tools.backup.execute({}, { toolCallId: "b1" });

    // destroy should now be available
    const result = await tools.destroy.execute({}, { toolCallId: "d1" });
    expect(result).toBe("destroyed");
  });

  it("failed deferred (execute throws) → net does NOT advance (destroy still blocked)", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const backupTool = mockTool(async () => { throw new Error("backup failed"); });
    const destroyTool = mockTool();
    const tools = gate.wrapTools({ backup: backupTool, destroy: destroyTool });

    try { await tools.backup.execute({}, { toolCallId: "b1" }); } catch {}

    // destroy should still be blocked (net didn't advance)
    expect(tools.destroy.execute({}, { toolCallId: "d1" })).rejects.toThrow(ToolCallBlockedError);
  });

  it("original error re-thrown after handleToolResult (error not swallowed)", async () => {
    const gate = createPetriflowGate([deferredNet]);
    const tool = mockTool(async () => { throw new Error("specific error"); });
    const tools = gate.wrapTools({ backup: tool });

    expect(tools.backup.execute({}, defaultOptions)).rejects.toThrow("specific error");
  });

  it("multiple sequential deferred calls accumulate correctly", async () => {
    // Use a net where deferred can repeat
    const repeatNet = testNet({
      name: "repeat-deferred",
      places: ["idle", "ready", "step1", "step2"],
      terminalPlaces: [],
      freeTools: [],
      initialMarking: { idle: 1, ready: 0, step1: 0, step2: 0 },
      transitions: [
        { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
        { name: "first", type: "auto" as const, inputs: ["ready"], outputs: ["step1"], tools: ["stepOne"], deferred: true },
        { name: "second", type: "auto" as const, inputs: ["step1"], outputs: ["step2"], tools: ["stepTwo"], deferred: true },
      ],
    });
    const gate = createPetriflowGate([repeatNet]);
    const step1 = mockTool(async () => "s1");
    const step2 = mockTool(async () => "s2");
    const tools = gate.wrapTools({ stepOne: step1, stepTwo: step2 });

    await tools.stepOne.execute({}, { toolCallId: "c1" });
    const result = await tools.stepTwo.execute({}, { toolCallId: "c2" });
    expect(result).toBe("s2");
  });
});

describe("Manual transitions", () => {
  it("no confirm callback → manual transition blocked (ToolCallBlockedError)", async () => {
    const gate = createPetriflowGate([manualNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow(ToolCallBlockedError);
  });

  it("confirm returns true → manual transition allowed, execute runs", async () => {
    const gate = createPetriflowGate([manualNet], {
      confirm: async () => true,
    });
    const tool = mockTool(async () => "approved");
    const tools = gate.wrapTools({ writeData: tool });

    const result = await tools.writeData.execute({}, defaultOptions);
    expect(result).toBe("approved");
  });

  it("confirm returns false → manual transition blocked (ToolCallBlockedError)", async () => {
    const gate = createPetriflowGate([manualNet], {
      confirm: async () => false,
    });
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow(ToolCallBlockedError);
  });

  it("confirm called with correct title and message from gate", async () => {
    const confirmFn = mock(async (_title: string, _message: string) => true);
    const gate = createPetriflowGate([manualNet], { confirm: confirmFn });
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    await tools.writeData.execute({}, defaultOptions);
    expect(confirmFn).toHaveBeenCalledTimes(1);
    const [title, message] = confirmFn.mock.calls[0]!;
    expect(title).toContain("write");
    expect(message).toContain("writeData");
  });
});

describe("Schema-only tools", () => {
  it("tool without execute function passes through unchanged", () => {
    const gate = createPetriflowGate([simpleNet]);
    const schema = schemaOnlyTool();
    const tools = gate.wrapTools({ myTool: schema });

    expect((tools.myTool as any).execute).toBeUndefined();
    expect(tools.myTool.description).toBe("Schema-only tool");
  });

  it("wrapped tool set includes schema-only tools with all original properties", () => {
    const gate = createPetriflowGate([simpleNet]);
    const schema = { description: "test", parameters: { type: "object" as const, properties: { x: { type: "string" } } } };
    const tools = gate.wrapTools({ myTool: schema });

    expect(tools.myTool.description).toBe("test");
    expect(tools.myTool.parameters).toEqual(schema.parameters);
  });
});

describe("Multi-net composition", () => {
  it("one blocking net + one allowing net → tool blocked (any-block-rejects-all)", async () => {
    const gate = createPetriflowGate([simpleNet, blockingNet]);
    const tool = mockTool();
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow(ToolCallBlockedError);
  });

  it("two allowing nets → tool allowed", async () => {
    const gate = createPetriflowGate([simpleNet, multiToolNet]);
    const tool = mockTool(async () => "ok");
    const tools = gate.wrapTools({ writeData: tool });

    const result = await tools.writeData.execute({}, defaultOptions);
    expect(result).toBe("ok");
  });

  it("free in all nets → tool allowed", async () => {
    const gate = createPetriflowGate([simpleNet, blockingNet]);
    const tool = mockTool(async () => "free");
    const tools = gate.wrapTools({ readData: tool });

    const result = await tools.readData.execute({}, defaultOptions);
    expect(result).toBe("free");
  });

  it("tool unknown to all nets → tool allowed (no jurisdiction = abstain)", async () => {
    const gate = createPetriflowGate([simpleNet, blockingNet]);
    const tool = mockTool(async () => "unknown-ok");
    const tools = gate.wrapTools({ unknownTool: tool });

    const result = await tools.unknownTool.execute({}, defaultOptions);
    expect(result).toBe("unknown-ok");
  });
});

describe("Registry mode (dynamic nets)", () => {
  it("addNet activates a net, tool now blocked by it", async () => {
    const gate = createPetriflowGate({
      registry: { simple: simpleNet, blocker: blockingNet },
      active: ["simple"],
    });
    const tool = mockTool(async () => "ok");
    const tools = gate.wrapTools({ writeData: tool });

    // Allowed with only simple active
    const r1 = await tools.writeData.execute({}, { toolCallId: "c1" });
    expect(r1).toBe("ok");

    // Add blocker
    const result = gate.addNet("blocker");
    expect(result.ok).toBe(true);

    // Now blocked
    expect(tools.writeData.execute({}, { toolCallId: "c2" })).rejects.toThrow(ToolCallBlockedError);
  });

  it("removeNet deactivates a net, tool now allowed", async () => {
    const gate = createPetriflowGate({
      registry: { simple: simpleNet, blocker: blockingNet },
    });
    const tool = mockTool(async () => "ok");
    const tools = gate.wrapTools({ writeData: tool });

    // Blocked with blocker active
    try { await tools.writeData.execute({}, { toolCallId: "c1" }); } catch {}

    // Remove blocker
    const result = gate.removeNet("blocker");
    expect(result.ok).toBe(true);

    // Now allowed
    const r = await tools.writeData.execute({}, { toolCallId: "c2" });
    expect(r).toBe("ok");
  });

  it("addNet unknown name returns error", () => {
    const gate = createPetriflowGate({
      registry: { simple: simpleNet },
      active: ["simple"],
    });

    const result = gate.addNet("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown");
  });

  it("removeNet inactive name returns error", () => {
    const gate = createPetriflowGate({
      registry: { simple: simpleNet, blocker: blockingNet },
      active: ["simple"],
    });

    const result = gate.removeNet("blocker");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not active");
  });
});

describe("System prompt & status", () => {
  it("systemPrompt() returns string containing net names", () => {
    const gate = createPetriflowGate([simpleNet]);
    const prompt = gate.systemPrompt();
    expect(prompt).toContain("simple");
  });

  it("systemPrompt() includes 'Active Petri Nets' header", () => {
    const gate = createPetriflowGate([simpleNet]);
    const prompt = gate.systemPrompt();
    expect(prompt).toContain("Active Petri Nets");
  });

  it("formatStatus() returns current marking for all nets", () => {
    const gate = createPetriflowGate([simpleNet, blockingNet]);
    const status = gate.formatStatus();
    expect(status).toContain("simple");
    expect(status).toContain("blocker");
  });

  it("formatStatus() shows active/inactive in registry mode", () => {
    const gate = createPetriflowGate({
      registry: { simple: simpleNet, blocker: blockingNet },
      active: ["simple"],
    });
    const status = gate.formatStatus();
    expect(status).toContain("active");
    expect(status).toContain("inactive");
  });
});

describe("Error propagation", () => {
  it("original execute error re-thrown with same message", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async () => { throw new Error("db connection failed"); });
    const tools = gate.wrapTools({ writeData: tool });

    expect(tools.writeData.execute({}, defaultOptions)).rejects.toThrow("db connection failed");
  });

  it("original execute error type preserved (not wrapped)", async () => {
    class CustomError extends Error { code = "CUSTOM"; }
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async () => { throw new CustomError("custom"); });
    const tools = gate.wrapTools({ writeData: tool });

    try {
      await tools.writeData.execute({}, defaultOptions);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CustomError);
      expect((e as CustomError).code).toBe("CUSTOM");
    }
  });

  it("gate error (ToolCallBlockedError) is distinguishable from execute errors", async () => {
    const gate = createPetriflowGate([blockingNet]);
    const tool = mockTool(async () => { throw new Error("execute error"); });
    const tools = gate.wrapTools({ writeData: tool });

    try {
      await tools.writeData.execute({}, defaultOptions);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolCallBlockedError);
      expect(e).not.toBeInstanceOf(TypeError);
    }
  });
});

describe("Shadow mode", () => {
  it("shadow mode: blocked tool does NOT throw (gate allows despite block)", async () => {
    const gate = createPetriflowGate([blockingNet], { mode: "shadow" });
    const tool = mockTool(async () => "shadow-ok");
    const tools = gate.wrapTools({ writeData: tool });

    const result = await tools.writeData.execute({}, defaultOptions);
    expect(result).toBe("shadow-ok");
  });

  it("shadow mode: onDecision callback still receives the block decision", async () => {
    const decisions: any[] = [];
    const gate = createPetriflowGate([blockingNet], {
      mode: "shadow",
      onDecision: (_event, decision) => decisions.push(decision),
    });
    const tool = mockTool(async () => "ok");
    const tools = gate.wrapTools({ writeData: tool });

    await tools.writeData.execute({}, defaultOptions);
    // In shadow mode, the decision callback fires but the block is suppressed
    // The onDecision receives the original event and the (suppressed) decision
    expect(decisions.length).toBeGreaterThan(0);
  });

  it("shadow mode: execute runs normally", async () => {
    const gate = createPetriflowGate([blockingNet], { mode: "shadow" });
    const tool = mockTool(async () => "ran");
    const tools = gate.wrapTools({ writeData: tool });

    await tools.writeData.execute({}, defaultOptions);
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });
});

describe("Edge cases", () => {
  it("empty tool set returns empty wrapped set", () => {
    const gate = createPetriflowGate([simpleNet]);
    const tools = gate.wrapTools({});
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("tool with same name as a net place doesn't cause conflicts", async () => {
    const gate = createPetriflowGate([simpleNet]);
    // "ready" is a place name in simpleNet, but as a tool name it has no jurisdiction
    const tool = mockTool(async () => "no-conflict");
    const tools = gate.wrapTools({ ready: tool });

    const result = await tools.ready.execute({}, defaultOptions);
    expect(result).toBe("no-conflict");
  });

  it("rapid sequential calls to same tool maintain correct state", async () => {
    const gate = createPetriflowGate([simpleNet]);
    const tool = mockTool(async (input: any) => input.n);
    const tools = gate.wrapTools({ writeData: tool });

    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await tools.writeData.execute({ n: i }, { toolCallId: `call-${i}` }));
    }
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("two different tools gated by same transition work correctly", async () => {
    const sharedNet = testNet({
      name: "shared",
      places: ["idle", "ready"],
      terminalPlaces: [],
      freeTools: [],
      initialMarking: { idle: 1, ready: 0 },
      transitions: [
        { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
        { name: "mutate", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["toolA", "toolB"] },
      ],
    });
    const gate = createPetriflowGate([sharedNet]);
    const a = mockTool(async () => "a");
    const b = mockTool(async () => "b");
    const tools = gate.wrapTools({ toolA: a, toolB: b });

    expect(await tools.toolA.execute({}, { toolCallId: "a1" })).toBe("a");
    expect(await tools.toolB.execute({}, { toolCallId: "b1" })).toBe("b");
  });
});
