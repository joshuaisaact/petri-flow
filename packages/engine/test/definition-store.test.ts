import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createDefinitionStore, serializeDefinition } from "../src/persistence/definition-store.js";
import { defineWorkflow } from "../src/workflow.js";
import type { SerializedDefinition } from "../src/persistence/definition-store.js";

const sample: SerializedDefinition = {
  name: "test-workflow",
  places: ["start", "middle", "end"],
  transitions: [
    { name: "begin", type: "automatic", inputs: ["start"], outputs: ["middle"], guard: null },
    { name: "finish", type: "automatic", inputs: ["middle"], outputs: ["end"], guard: "ready" },
  ],
  initialMarking: { start: 1, middle: 0, end: 0 },
  initialContext: { ready: true },
  terminalPlaces: ["end"],
};

describe("createDefinitionStore", () => {
  it("save and load round-trip", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    store.save(sample);

    const loaded = store.load("test-workflow");
    expect(loaded).toEqual(sample);
  });

  it("load returns null for missing definition", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    expect(store.load("nonexistent")).toBeNull();
  });

  it("list returns saved names", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    store.save(sample);
    store.save({ ...sample, name: "another" });

    expect(store.list()).toEqual(["another", "test-workflow"]);
  });

  it("save overwrites existing definition", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    store.save(sample);

    const updated = { ...sample, initialContext: { ready: false } };
    store.save(updated);

    const loaded = store.load("test-workflow");
    expect(loaded!.initialContext).toEqual({ ready: false });
  });

  it("delete removes definition", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    store.save(sample);

    expect(store.delete("test-workflow")).toBe(true);
    expect(store.load("test-workflow")).toBeNull();
  });

  it("delete returns false for missing definition", () => {
    const store = createDefinitionStore(new Database(":memory:"));
    expect(store.delete("nonexistent")).toBe(false);
  });
});

describe("serializeDefinition", () => {
  it("extracts serializable fields from a WorkflowDefinition", () => {
    const def = defineWorkflow({
      name: "serialize-test",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "script", inputs: ["a"], outputs: ["b"], guard: "x > 1", execute: async () => ({}) },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: { x: 5 },
      terminalPlaces: ["b"],
      invariants: [{ weights: { a: 1, b: 1 } }],
    });

    const serialized = serializeDefinition(def);

    expect(serialized.name).toBe("serialize-test");
    expect(serialized.places).toEqual(["a", "b"]);
    expect(serialized.transitions).toEqual([
      { name: "go", type: "script", inputs: ["a"], outputs: ["b"], guard: "x > 1" },
    ]);
    expect(serialized.initialMarking).toEqual({ a: 1, b: 0 });
    expect(serialized.initialContext).toEqual({ x: 5 });
    expect(serialized.terminalPlaces).toEqual(["b"]);
    expect(serialized.invariants).toEqual([{ weights: { a: 1, b: 1 } }]);
  });

  it("includes timeout when present", () => {
    const def = defineWorkflow({
      name: "timeout-ser",
      places: ["waiting", "timed_out", "done"],
      transitions: [
        { name: "wait", type: "timer", inputs: ["waiting"], outputs: ["done"], guard: "approved", timeout: { place: "timed_out" as any, ms: 5000 } },
        { name: "escalate", type: "automatic", inputs: ["waiting", "timed_out"], outputs: ["done"], guard: null },
      ],
      initialMarking: { waiting: 1, timed_out: 0, done: 0 },
      initialContext: { approved: false },
      terminalPlaces: ["done"],
    });

    const serialized = serializeDefinition(def);
    expect(serialized.transitions[0]!.timeout).toEqual({ place: "timed_out", ms: 5000 });
    expect(serialized.transitions[1]!.timeout).toBeUndefined();
  });

  it("round-trips through defineWorkflow", () => {
    const original = defineWorkflow({
      name: "round-trip",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: "score > 10" },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: { score: 20 },
      terminalPlaces: ["b"],
    });

    const serialized = serializeDefinition(original);
    const restored = defineWorkflow(serialized);

    expect(restored.name).toBe("round-trip");
    expect(restored.net.initialMarking).toEqual({ a: 1, b: 0 });
    expect(restored.net.transitions[0]!.guard).toBe("score > 10");
    expect(restored.terminalPlaces).toEqual(["b"]);
    // Guards recompiled from strings
    expect(restored.guards.has("go")).toBe(true);
  });

  it("round-trips through store and defineWorkflow", () => {
    const store = createDefinitionStore(new Database(":memory:"));

    const original = defineWorkflow({
      name: "full-trip",
      places: ["idle", "done"],
      transitions: [
        { name: "finish", type: "automatic", inputs: ["idle"], outputs: ["done"], guard: null },
      ],
      initialMarking: { idle: 1, done: 0 },
      initialContext: {},
      terminalPlaces: ["done"],
    });

    store.save(serializeDefinition(original));
    const loaded = store.load("full-trip")!;
    const restored = defineWorkflow(loaded);

    expect(restored.name).toBe("full-trip");
    expect(restored.net.transitions).toHaveLength(1);
    expect(restored.terminalPlaces).toEqual(["done"]);
  });
});
