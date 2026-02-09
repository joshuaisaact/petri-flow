import { describe, it, expect } from "bun:test";
import {
  reachableStates,
  terminalStates,
  isDeadlockFree,
  checkInvariant,
  enabledTransitions,
  canFire,
  fire,
  toDot,
} from "petri-ts";
import { defineWorkflow, toNet } from "../src/workflow.js";
import type { WorkflowNet, WorkflowTransition } from "../src/types.js";
import type { PetriNet, Marking } from "petri-ts";

type Place = "idle" | "processing" | "done";

type Ctx = { approved: boolean };

const transitions: WorkflowTransition<Place, Ctx>[] = [
  {
    name: "start",
    inputs: ["idle"],
    outputs: ["processing"],
    guard: "approved",
  },
  {
    name: "finish",
    inputs: ["processing"],
    outputs: ["done"],
    guard: null,
  },
];

const initialMarking: Marking<Place> = { idle: 1, processing: 0, done: 0 };

describe("structural compatibility", () => {
  it("WorkflowNet passes directly to petri-ts analysis functions", () => {
    const net: WorkflowNet<Place, Ctx> = { transitions, initialMarking };

    // WorkflowNet IS a PetriNet structurally — pass it directly
    const reachable = reachableStates(net);
    expect(reachable.length).toBeGreaterThan(0);

    const terminal = terminalStates(net);
    expect(terminal).toEqual([{ idle: 0, processing: 0, done: 1 }]);

    const deadlockFree = isDeadlockFree(net);
    expect(deadlockFree).toBe(false); // "done" is a terminal state

    const enabled = enabledTransitions(net, initialMarking);
    expect(enabled.map((t) => t.name)).toEqual(["start"]);
  });

  it("toNet strips extensions for serialization", () => {
    const net: WorkflowNet<Place, Ctx> = { transitions, initialMarking };
    const plain = toNet(net);

    // Plain net should have no guard/timeout
    for (const t of plain.transitions) {
      expect((t as any).guard).toBeUndefined();
      expect((t as any).timeout).toBeUndefined();
    }

    // But still works with analysis
    const terminal = terminalStates(plain);
    expect(terminal).toEqual([{ idle: 0, processing: 0, done: 1 }]);
  });

  it("checkInvariant works with WorkflowNet", () => {
    const net: WorkflowNet<Place, Ctx> = { transitions, initialMarking };
    // Total tokens should be conserved: 1 token always in the system
    const invariant = checkInvariant(net, { idle: 1, processing: 1, done: 1 });
    expect(invariant).toBe(true);
  });

  it("toDot works with WorkflowNet", () => {
    const net: WorkflowNet<Place, Ctx> = { transitions, initialMarking };
    const dot = toDot(net);
    expect(dot).toContain("digraph");
    expect(dot).toContain("start");
    expect(dot).toContain("finish");
  });

  it("canFire and fire work with WorkflowTransition", () => {
    const t = transitions[0]!;
    expect(canFire(initialMarking, t)).toBe(true);

    const next = fire(initialMarking, t);
    expect(next).toEqual({ idle: 0, processing: 1, done: 0 });
  });
});

describe("defineWorkflow", () => {
  it("validates places and returns a WorkflowDefinition", () => {
    const def = defineWorkflow({
      name: "test",
      places: ["idle", "processing", "done"] as Place[],
      transitions,
      initialMarking,
      initialContext: { approved: false },
      terminalPlaces: ["done"],
    });

    expect(def.name).toBe("test");
    expect(def.net.transitions).toHaveLength(2);
    expect(def.initialContext).toEqual({ approved: false });
  });

  it("throws on unknown input place", () => {
    expect(() =>
      defineWorkflow({
        name: "bad",
        places: ["idle", "done"] as any,
        transitions: [
          { name: "bad", inputs: ["idle"], outputs: ["unknown" as any], guard: null },
        ],
        initialMarking: { idle: 1, done: 0 } as any,
        initialContext: {},
        terminalPlaces: ["done"] as any,
      }),
    ).toThrow('unknown output place "unknown"');
  });

  it("throws on unknown place in initial marking", () => {
    expect(() =>
      defineWorkflow({
        name: "bad",
        places: ["idle"] as any,
        transitions: [],
        initialMarking: { idle: 1, ghost: 0 } as any,
        initialContext: {},
        terminalPlaces: [] as any,
      }),
    ).toThrow('unknown place "ghost"');
  });

  it("throws on unknown terminal place", () => {
    expect(() =>
      defineWorkflow({
        name: "bad",
        places: ["idle", "done"] as any,
        transitions: [],
        initialMarking: { idle: 1, done: 0 } as any,
        initialContext: {},
        terminalPlaces: ["donee"] as any, // intentionally invalid
      }),
    ).toThrow('Terminal place "donee" is not a known place');
  });
});
