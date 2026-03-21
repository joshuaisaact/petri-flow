import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import type { Marking } from "petri-ts";
import { defineWorkflow, expandWorkflow, injectTokens } from "./workflow.js";
import { createExecutor } from "./executor.js";
import { enabledWorkflowTransitions } from "./engine.js";
import { Scheduler } from "./scheduler.js";
import { sqliteAdapter } from "./persistence/sqlite-adapter.js";

type Place = "start" | "middle" | "end";
type Ctx = { log: string[] };

const baseDef = defineWorkflow<Place, Ctx>({
  name: "expand-test",
  places: ["start", "middle", "end"],
  transitions: [
    {
      name: "begin",
      type: "automatic",
      inputs: ["start"],
      outputs: ["middle"],
      guard: null,
      execute: async (ctx) => ({ log: [...ctx.log, "began"] }),
    },
    {
      name: "finish",
      type: "automatic",
      inputs: ["middle"],
      outputs: ["end"],
      guard: null,
      execute: async (ctx) => ({ log: [...ctx.log, "finished"] }),
    },
  ],
  initialMarking: { start: 1, middle: 0, end: 0 },
  initialContext: { log: [] },
  terminalPlaces: ["end"],
});

describe("expandWorkflow", () => {
  it("adds new transitions that wire in correctly", () => {
    type EPlace = Place | "extra";

    const expanded = expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "bonus",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["extra"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "bonus"] }),
        },
      ],
      ["extra"],
      { terminalPlaces: ["extra"] },
    );

    expect(expanded.net.transitions).toHaveLength(3);
    expect(expanded.net.transitions.map((t) => t.name)).toContain("bonus");
    expect(expanded.terminalPlaces).toContain("extra");
    expect(expanded.executors.has("bonus")).toBe(true);
  });

  it("preserves existing transitions and executors exactly", () => {
    type EPlace = Place | "extra";

    const expanded = expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "bonus",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["extra"],
          guard: null,
        },
      ],
      ["extra"],
    );

    // Original transitions unchanged
    expect(expanded.net.transitions[0]!.name).toBe("begin");
    expect(expanded.net.transitions[1]!.name).toBe("finish");
    // Original executors preserved
    expect(expanded.executors.has("begin")).toBe(true);
    expect(expanded.executors.has("finish")).toBe(true);
    // Original definition unchanged
    expect(baseDef.net.transitions).toHaveLength(2);
  });

  it("compiles guards on new transitions", () => {
    type EPlace = Place | "guarded_out";

    const expanded = expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "guarded",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["guarded_out"],
          guard: "log.length > 0",
        },
      ],
      ["guarded_out"],
    );

    expect(expanded.guards.has("guarded")).toBe(true);

    // Guard should evaluate correctly
    const marking = { start: 0, middle: 1, end: 0, guarded_out: 0 } as any;
    const enabled = enabledWorkflowTransitions(
      expanded.net,
      marking,
      { log: ["something"] },
      expanded.guards,
    );
    expect(enabled.map((t) => t.name)).toContain("guarded");

    const enabledEmpty = enabledWorkflowTransitions(
      expanded.net,
      marking,
      { log: [] },
      expanded.guards,
    );
    expect(enabledEmpty.map((t) => t.name)).not.toContain("guarded");
  });

  it("does not mutate the original definition", () => {
    type EPlace = Place | "new_place";

    const originalTransitionCount = baseDef.net.transitions.length;
    const originalGuardCount = baseDef.guards.size;
    const originalExecutorCount = baseDef.executors.size;
    const originalTerminalCount = baseDef.terminalPlaces.length;

    expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "extra",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["new_place"],
          guard: "log.length > 0",
          execute: async (ctx) => ({ log: [...ctx.log, "extra"] }),
        },
      ],
      ["new_place"],
      { terminalPlaces: ["new_place"] },
    );

    expect(baseDef.net.transitions.length).toBe(originalTransitionCount);
    expect(baseDef.guards.size).toBe(originalGuardCount);
    expect(baseDef.executors.size).toBe(originalExecutorCount);
    expect(baseDef.terminalPlaces.length).toBe(originalTerminalCount);
  });

  it("rejects transitions referencing unknown places", () => {
    expect(() =>
      expandWorkflow(baseDef, [
        {
          name: "bad",
          type: "automatic",
          inputs: ["nonexistent" as Place],
          outputs: ["end"],
          guard: null,
        },
      ]),
    ).toThrow('Transition "bad" references unknown input place "nonexistent"');
  });

  it("rejects unknown terminal places", () => {
    expect(() =>
      expandWorkflow(baseDef, [], undefined, {
        terminalPlaces: ["nonexistent" as Place],
      }),
    ).toThrow('Terminal place "nonexistent" is not a known place');
  });

  it("validates expanded definition end-to-end with executor", async () => {
    type EPlace = Place | "branch";

    const expanded = expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "branch_off",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["branch"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "branched"] }),
        },
      ],
      ["branch"],
      { terminalPlaces: ["branch"] },
    );

    const executor = createExecutor(expanded);
    // Fire "begin" first
    const r1 = await executor.step(
      "inst-1",
      { start: 1, middle: 0, end: 0, branch: 0 } as any,
      { log: [] },
    );
    expect(r1.kind).toBe("fired");
    if (r1.kind === "fired") {
      expect(r1.transition).toBe("begin");
      // Now from middle, both "finish" and "branch_off" should be enabled
      const enabled = enabledWorkflowTransitions(
        expanded.net,
        r1.marking,
        r1.context,
        expanded.guards,
      );
      expect(enabled.map((t) => t.name)).toContain("finish");
      expect(enabled.map((t) => t.name)).toContain("branch_off");
    }
  });
});

describe("injectTokens", () => {
  it("adds tokens to an existing place", () => {
    const marking = { start: 0, middle: 0, end: 0 };
    const result = injectTokens(marking, "middle", 2);
    expect(result.middle).toBe(2);
    // Original unchanged
    expect(marking.middle).toBe(0);
  });

  it("defaults count to 1", () => {
    const marking = { start: 0, middle: 0, end: 0 };
    const result = injectTokens(marking, "start");
    expect(result.start).toBe(1);
  });

  it("adds to existing token count", () => {
    const marking = { start: 3, middle: 0, end: 0 };
    const result = injectTokens(marking, "start", 2);
    expect(result.start).toBe(5);
  });

  it("injected tokens enable new transitions", () => {
    type IPlace = "waiting" | "approval" | "done";
    type ICtx = Record<string, unknown>;

    const def = defineWorkflow<IPlace, ICtx>({
      name: "inject-enable",
      places: ["waiting", "approval", "done"],
      transitions: [
        {
          name: "process",
          type: "automatic",
          inputs: ["waiting", "approval"],
          outputs: ["done"],
          guard: null,
        },
      ],
      initialMarking: { waiting: 1, approval: 0, done: 0 },
      initialContext: {},
      terminalPlaces: ["done"],
    });

    const marking = { waiting: 1, approval: 0, done: 0 } as Marking<IPlace>;

    // Without injection — no enabled transitions
    let enabled = enabledWorkflowTransitions<IPlace, ICtx>(
      def.net,
      marking,
      {},
      def.guards,
    );
    expect(enabled).toHaveLength(0);

    // After injection — transition becomes enabled
    const injected = injectTokens<IPlace>(marking, "approval");
    enabled = enabledWorkflowTransitions<IPlace, ICtx>(def.net, injected, {}, def.guards);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.name).toBe("process");
  });
});

describe("Scheduler.updateExecutor", () => {
  it("picks up expanded workflow on next tick", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(baseDef), { adapter: sqliteAdapter(db, baseDef.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("expand-1");

    // Tick once — fires "begin"
    await scheduler.tick();
    expect(fired).toEqual(["begin"]);

    // Now expand the definition with a new transition from "middle"
    type EPlace = Place | "bonus";
    const expanded = expandWorkflow<EPlace, Ctx>(
      baseDef as any,
      [
        {
          name: "do_bonus",
          type: "automatic",
          inputs: ["middle"],
          outputs: ["bonus"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "bonus"] }),
        },
      ],
      ["bonus"],
      { terminalPlaces: ["bonus"] },
    );

    // Update the scheduler's executor
    scheduler.updateExecutor(createExecutor(expanded) as any);

    // Tick again — now "finish" and "do_bonus" are both enabled from "middle"
    // Sequential step fires the first one: "finish"
    await scheduler.tick();
    expect(fired).toContain("finish");
  });
});
