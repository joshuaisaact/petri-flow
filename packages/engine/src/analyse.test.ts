import { describe, it, expect } from "bun:test";
import { analyse } from "./analyse.js";
import { defineWorkflow } from "./workflow.js";

describe("analyse", () => {
  it("classifies valid terminal states", () => {
    const def = defineWorkflow({
      name: "simple",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
      terminalPlaces: ["b"],
    });

    const result = analyse(def);
    expect(result.workflowName).toBe("simple");
    expect(result.validTerminalStates).toEqual([{ a: 0, b: 1 }]);
    expect(result.unexpectedTerminalStates).toEqual([]);
  });

  it("detects unexpected terminal states", () => {
    const def = defineWorkflow({
      name: "stuck",
      places: ["a", "b", "c"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
        { name: "split", type: "automatic", inputs: ["a"], outputs: ["c"], guard: null },
      ],
      initialMarking: { a: 1, b: 0, c: 0 },
      initialContext: {},
      terminalPlaces: ["b"],
    });

    const result = analyse(def);
    expect(result.validTerminalStates).toEqual([{ a: 0, b: 1, c: 0 }]);
    expect(result.unexpectedTerminalStates).toEqual([{ a: 0, b: 0, c: 1 }]);
  });

  it("treats all terminal states as valid when terminalPlaces is empty", () => {
    const def = defineWorkflow({
      name: "no-terminals",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
      terminalPlaces: [],
    });

    const result = analyse(def);
    expect(result.validTerminalStates).toHaveLength(1);
    expect(result.unexpectedTerminalStates).toEqual([]);
  });

  it("checks invariants from definition", () => {
    const def = defineWorkflow({
      name: "invariant-test",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
      terminalPlaces: ["b"],
      invariants: [{ weights: { a: 1, b: 1 } }],
    });

    const result = analyse(def);
    expect(result.invariants).toHaveLength(1);
    expect(result.invariants[0]!.holds).toBe(true);
  });

  it("generates dot output when requested", () => {
    const def = defineWorkflow({
      name: "dot-test",
      places: ["a", "b"],
      transitions: [
        { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
      terminalPlaces: ["b"],
    });

    const result = analyse(def, { dot: true });
    expect(result.dot).toBeDefined();
    expect(result.dot).toContain("digraph");
  });
});
