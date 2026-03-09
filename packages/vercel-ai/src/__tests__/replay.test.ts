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
    const gate = createPetriflowGate([net]);
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
    const gate = createPetriflowGate([net]);
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
    const gate = createPetriflowGate([net]);
    const session = gate.wrapTools(toolDefs);

    const state = session.manager.getActiveNets()[0]!;
    expect(state.state.marking.ready).toBe(1);
  });
});
