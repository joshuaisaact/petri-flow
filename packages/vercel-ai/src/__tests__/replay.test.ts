import { describe, expect, it } from "bun:test";
import { extractReplayEntries } from "../replay.js";
import { createPetriflowGate } from "../index.js";
import { defineSkillNet } from "@petriflow/gate";

describe("extractReplayEntries", () => {
  it("extracts successful tool results from messages", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "test", input: { suite: "unit" } },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "test", output: { type: "text", value: "ok" } },
        ],
      },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries).toEqual([
      { toolName: "test", input: { suite: "unit" }, isError: false },
    ]);
  });

  it("marks error results as isError: true", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "deploy", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "deploy", output: { type: "error-text", value: "failed" } },
        ],
      },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries).toEqual([
      { toolName: "deploy", input: {}, isError: true },
    ]);
  });

  it("handles execution-denied as error", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "rm", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "rm", output: { type: "execution-denied", reason: "blocked" } },
        ],
      },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries[0]!.isError).toBe(true);
  });

  it("correlates calls and results by toolCallId", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "test", input: { a: 1 } },
          { type: "tool-call", toolCallId: "c2", toolName: "lint", input: { b: 2 } },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "test", output: { type: "text", value: "ok" } },
          { type: "tool-result", toolCallId: "c2", toolName: "lint", output: { type: "text", value: "ok" } },
        ],
      },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries).toEqual([
      { toolName: "test", input: { a: 1 }, isError: false },
      { toolName: "lint", input: { b: 2 }, isError: false },
    ]);
  });

  it("ignores non-tool messages", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "system", content: "you are helpful" },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries).toEqual([]);
  });

  it("handles result without matching call (no input)", () => {
    const messages = [
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "test", output: { type: "text", value: "ok" } },
        ],
      },
    ];

    const entries = extractReplayEntries(messages);
    expect(entries).toEqual([
      { toolName: "test", input: undefined, isError: false },
    ]);
  });

  it("uses isToolResultError to classify custom error results", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "runCode", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "runCode",
            output: { success: false, error: "sandbox crashed" },
          },
        ],
      },
    ];

    // Without callback — treated as success
    expect(extractReplayEntries(messages)[0]!.isError).toBe(false);

    // With callback — treated as error
    const entries = extractReplayEntries(messages, {
      isToolResultError: (_name, result) =>
        typeof result === "object" && result !== null && (result as any).success === false,
    });
    expect(entries[0]!.isError).toBe(true);
  });

  it("isToolResultError does not override built-in error detection", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "deploy", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "deploy", output: { type: "error-text", value: "failed" } },
        ],
      },
    ];

    // Custom says "not error", but built-in detects it — still isError: true
    const entries = extractReplayEntries(messages, {
      isToolResultError: () => false,
    });
    expect(entries[0]!.isError).toBe(true);
  });
});

const net = defineSkillNet({
  name: "test-net",
  places: ["ready", "tested"],
  terminalPlaces: [],
  freeTools: ["read"],
  initialMarking: { ready: 1, tested: 0 },
  transitions: [
    { name: "run-test", type: "auto" as const, inputs: ["ready"], outputs: ["tested"], tools: ["test"], deferred: true },
    { name: "run-deploy", type: "auto" as const, inputs: ["tested"], outputs: ["tested"], tools: ["deploy"] },
  ],
});

const toolDefs = {
  test: { execute: async () => "ok" },
  deploy: { execute: async () => "ok" },
};

describe("wrapTools with messages", () => {
  it("initializes gate state from message history", () => {
    const gate = createPetriflowGate([net], { isToolResultError: () => false });
    const session = gate.wrapTools(toolDefs, {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "c1", toolName: "test", input: {} },
          ],
        },
        {
          role: "tool",
          content: [
            { type: "tool-result", toolCallId: "c1", toolName: "test", output: { type: "text", value: "ok" } },
          ],
        },
      ],
    });

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.tested).toBe(1);
  });

  it("skips error results", () => {
    const gate = createPetriflowGate([net], { isToolResultError: () => false });
    const session = gate.wrapTools(toolDefs, {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "c1", toolName: "test", input: {} },
          ],
        },
        {
          role: "tool",
          content: [
            { type: "tool-result", toolCallId: "c1", toolName: "test", output: { type: "error-text", value: "fail" } },
          ],
        },
      ],
    });

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
    expect(state.state.marking.tested).toBe(0);
  });

  it("works without messages option", () => {
    const gate = createPetriflowGate([net], { isToolResultError: () => false });
    const session = gate.wrapTools(toolDefs);

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
  });
});

describe("isToolResultError (gate-level)", () => {
  it("replay: skips deferred transition when isToolResultError matches", () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: (_name, result) =>
        typeof result === "object" && result !== null && (result as any).success === false,
    });

    const session = gate.wrapTools(toolDefs, {
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "test", input: {} }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "test",
              output: { success: false, error: "sandbox 500" },
            },
          ],
        },
      ],
    });

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
    expect(state.state.marking.tested).toBe(0);
  });

  it("replay: fires deferred only for successes in mixed history", () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: (_name, result) =>
        typeof result === "object" && result !== null && (result as any).success === false,
    });

    const session = gate.wrapTools(toolDefs, {
      messages: [
        // Failure 1
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "test", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "test", output: { success: false, error: "sandbox 500" } }] },
        // Failure 2
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c2", toolName: "test", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "c2", toolName: "test", output: { success: false, error: "sandbox 500" } }] },
        // Success
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c3", toolName: "test", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "c3", toolName: "test", output: { success: true } }] },
      ],
    });

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(0);
    expect(state.state.marking.tested).toBe(1);
  });

  it("live: non-throwing error result does not fire deferred transition", async () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: (_name, result) =>
        typeof result === "object" && result !== null && (result as any).success === false,
    });

    const failingTest = { execute: async (_input: unknown, _opts: { toolCallId: string }) => ({ success: false, error: "sandbox crashed" }) };
    const deployTool = { execute: async (_input: unknown, _opts: { toolCallId: string }) => "deployed" };
    const session = gate.wrapTools({ test: failingTest, deploy: deployTool });

    // Tool executes and returns the error object (doesn't throw)
    const result = await session.tools.test.execute({}, { toolCallId: "c1" });
    expect(result).toEqual({ success: false, error: "sandbox crashed" });

    // But deferred transition should NOT have fired — deploy still blocked
    try {
      await session.tools.deploy.execute({}, { toolCallId: "c2" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("blocked");
    }
  });

  it("live: successful result fires deferred transition normally", async () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: (_name, result) =>
        typeof result === "object" && result !== null && (result as any).success === false,
    });

    const passingTest = { execute: async (_input: unknown, _opts: { toolCallId: string }) => ({ success: true, output: "all pass" }) };
    const deployTool = { execute: async (_input: unknown, _opts: { toolCallId: string }) => "deployed" };
    const session = gate.wrapTools({ test: passingTest, deploy: deployTool });

    await session.tools.test.execute({}, { toolCallId: "c1" });

    // Deploy should now be allowed
    const result = await session.tools.deploy.execute({}, { toolCallId: "c2" });
    expect(result).toBe("deployed");
  });

  it("live: callback throwing treats result as error (fail-closed)", async () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: () => { throw new Error("callback bug"); },
    });

    const testTool = { execute: async (_input: unknown, _opts: { toolCallId: string }) => "ok" };
    const deployTool = { execute: async (_input: unknown, _opts: { toolCallId: string }) => "deployed" };
    const session = gate.wrapTools({ test: testTool, deploy: deployTool });

    // Tool executes fine, but callback throws — treated as error
    const result = await session.tools.test.execute({}, { toolCallId: "c1" });
    expect(result).toBe("ok");

    // Deferred transition should NOT have fired
    try {
      await session.tools.deploy.execute({}, { toolCallId: "c2" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("blocked");
    }
  });

  it("replay: callback throwing treats result as error (fail-closed)", () => {
    const gate = createPetriflowGate([net], {
      isToolResultError: () => { throw new Error("callback bug"); },
    });

    const session = gate.wrapTools(toolDefs, {
      messages: [
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "test", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "test", output: "ok" }] },
      ],
    });

    // Callback threw during replay — treated as error, transition didn't fire
    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
    expect(state.state.marking.tested).toBe(0);
  });
});
