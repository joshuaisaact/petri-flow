import { describe, it, expect } from "bun:test";
import { analyse, defineWorkflow } from "@petriflow/engine";

type Place = "idle" | "processing" | "done";

const definition = defineWorkflow<Place, Record<string, unknown>>({
  name: "simple-pipeline",
  places: ["idle", "processing", "done"],
  transitions: [
    { name: "start", inputs: ["idle"], outputs: ["processing"] },
    { name: "finish", inputs: ["processing"], outputs: ["done"] },
  ],
  initialMarking: { idle: 1, processing: 0, done: 0 },
  initialContext: {},
});

describe("analyse", () => {
  it("returns correct analysis for simple pipeline", () => {
    const result = analyse(definition);

    expect(result.workflowName).toBe("simple-pipeline");
    expect(result.reachableStateCount).toBe(3);
    expect(result.terminalStates).toEqual([{ idle: 0, processing: 0, done: 1 }]);
    expect(result.isDeadlockFree).toBe(false); // "done" is terminal
  });

  it("checks invariants", () => {
    const result = analyse(definition, {
      invariants: [
        { weights: { idle: 1, processing: 1, done: 1 } }, // Should hold: tokens conserved
        { weights: { idle: 2, processing: 1, done: 1 } }, // Should NOT hold
      ],
    });

    expect(result.invariants).toHaveLength(2);
    expect(result.invariants[0]!.holds).toBe(true);
    expect(result.invariants[1]!.holds).toBe(false);
  });

  it("generates DOT output", () => {
    const result = analyse(definition, { dot: true });
    expect(result.dot).toBeDefined();
    expect(result.dot).toContain("digraph");
  });

  it("analyses deadlock-free net", () => {
    type CyclePlace = "a" | "b";
    const cycleDef = defineWorkflow<CyclePlace, Record<string, unknown>>({
      name: "cycle",
      places: ["a", "b"],
      transitions: [
        { name: "forward", inputs: ["a"], outputs: ["b"] },
        { name: "back", inputs: ["b"], outputs: ["a"] },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
    });

    const result = analyse(cycleDef);
    expect(result.isDeadlockFree).toBe(true);
    expect(result.terminalStates).toEqual([]);
  });
});
