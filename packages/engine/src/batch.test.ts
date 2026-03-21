import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { defineWorkflow } from "./workflow.js";
import { createExecutor } from "./executor.js";
import { Scheduler } from "./scheduler.js";
import { sqliteAdapter } from "./persistence/sqlite-adapter.js";

describe("stepBatch", () => {
  it("fires independent transitions concurrently", async () => {
    // Two independent branches: start splits into two parallel paths
    type Place = "start" | "a_ready" | "b_ready" | "a_done" | "b_done";
    type Ctx = { log: string[] };

    const def = defineWorkflow<Place, Ctx>({
      name: "parallel-test",
      places: ["start", "a_ready", "b_ready", "a_done", "b_done"],
      transitions: [
        {
          name: "split",
          type: "automatic",
          inputs: ["start"],
          outputs: ["a_ready", "b_ready"],
          guard: null,
        },
        {
          name: "do_a",
          type: "automatic",
          inputs: ["a_ready"],
          outputs: ["a_done"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "a"] }),
        },
        {
          name: "do_b",
          type: "automatic",
          inputs: ["b_ready"],
          outputs: ["b_done"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "b"] }),
        },
      ],
      initialMarking: { start: 0, a_ready: 1, b_ready: 1, a_done: 0, b_done: 0 },
      initialContext: { log: [] },
      terminalPlaces: ["a_done", "b_done"],
    });

    const executor = createExecutor(def);
    const result = await executor.stepBatch(
      "inst-1",
      { start: 0, a_ready: 1, b_ready: 1, a_done: 0, b_done: 0 },
      { log: [] },
      10,
    );

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transitions).toHaveLength(2);
      expect(result.transitions).toContain("do_a");
      expect(result.transitions).toContain("do_b");
      expect(result.marking.a_done).toBe(1);
      expect(result.marking.b_done).toBe(1);
      expect(result.marking.a_ready).toBe(0);
      expect(result.marking.b_ready).toBe(0);
      expect(result.terminal).toBe(true);
    }
  });

  it("conflicting transitions don't double-fire", async () => {
    // Two transitions compete for the same input place
    type Place = "shared" | "out_a" | "out_b";
    type Ctx = { winner: string };

    const def = defineWorkflow<Place, Ctx>({
      name: "conflict-test",
      places: ["shared", "out_a", "out_b"],
      transitions: [
        {
          name: "take_a",
          type: "automatic",
          inputs: ["shared"],
          outputs: ["out_a"],
          guard: null,
          execute: async () => ({ winner: "a" }),
        },
        {
          name: "take_b",
          type: "automatic",
          inputs: ["shared"],
          outputs: ["out_b"],
          guard: null,
          execute: async () => ({ winner: "b" }),
        },
      ],
      initialMarking: { shared: 1, out_a: 0, out_b: 0 },
      initialContext: { winner: "" },
      terminalPlaces: ["out_a", "out_b"],
    });

    const executor = createExecutor(def);
    const result = await executor.stepBatch(
      "inst-1",
      { shared: 1, out_a: 0, out_b: 0 },
      { winner: "" },
      10,
    );

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      // Only one should fire — first-enabled wins
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0]).toBe("take_a");
      // Token was consumed from "shared"
      expect(result.marking.shared).toBe(0);
    }
  });

  it("context patches merge in transition-name order", async () => {
    type Place = "p1" | "p2" | "done1" | "done2";
    type Ctx = { values: string[]; last: string };

    const def = defineWorkflow<Place, Ctx>({
      name: "merge-test",
      places: ["p1", "p2", "done1", "done2"],
      transitions: [
        {
          name: "z_second",
          type: "automatic",
          inputs: ["p1"],
          outputs: ["done1"],
          guard: null,
          execute: async (ctx) => ({ values: [...ctx.values, "z"], last: "z" }),
        },
        {
          name: "a_first",
          type: "automatic",
          inputs: ["p2"],
          outputs: ["done2"],
          guard: null,
          execute: async (ctx) => ({ values: [...ctx.values, "a"], last: "a" }),
        },
      ],
      initialMarking: { p1: 1, p2: 1, done1: 0, done2: 0 },
      initialContext: { values: [], last: "" },
      terminalPlaces: ["done1", "done2"],
    });

    const executor = createExecutor(def);
    const result = await executor.stepBatch(
      "inst-1",
      { p1: 1, p2: 1, done1: 0, done2: 0 },
      { values: [], last: "" },
      10,
    );

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      // "a_first" sorts before "z_second", so a_first's patch is applied first,
      // then z_second's patch overwrites. last should be "z".
      expect(result.context.last).toBe("z");
    }
  });

  it("maxConcurrent=1 behaves identically to step()", async () => {
    type Place = "p1" | "p2" | "done1" | "done2";
    type Ctx = { log: string[] };

    const def = defineWorkflow<Place, Ctx>({
      name: "single-batch",
      places: ["p1", "p2", "done1", "done2"],
      transitions: [
        {
          name: "do_first",
          type: "automatic",
          inputs: ["p1"],
          outputs: ["done1"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "first"] }),
        },
        {
          name: "do_second",
          type: "automatic",
          inputs: ["p2"],
          outputs: ["done2"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "second"] }),
        },
      ],
      initialMarking: { p1: 1, p2: 1, done1: 0, done2: 0 },
      initialContext: { log: [] },
      terminalPlaces: ["done1", "done2"],
    });

    const executor = createExecutor(def);
    const marking = { p1: 1, p2: 1, done1: 0, done2: 0 } as const;
    const ctx = { log: [] };

    const stepResult = await executor.step("inst-1", marking, ctx);
    const batchResult = await executor.stepBatch("inst-1", marking, ctx, 1);

    // Both should fire exactly one transition — the same one (first enabled)
    expect(stepResult.kind).toBe("fired");
    expect(batchResult.kind).toBe("fired");
    if (stepResult.kind === "fired" && batchResult.kind === "fired") {
      expect(batchResult.transitions).toHaveLength(1);
      expect(batchResult.transitions[0]).toBe(stepResult.transition);
      expect(batchResult.marking).toEqual(stepResult.marking);
      expect(batchResult.context).toEqual(stepResult.context);
    }
  });

  it("returns idle when no transitions are enabled", async () => {
    type Place = "done";
    type Ctx = Record<string, unknown>;

    const def = defineWorkflow<Place, Ctx>({
      name: "empty-batch",
      places: ["done"],
      transitions: [],
      initialMarking: { done: 1 },
      initialContext: {},
      terminalPlaces: ["done"],
    });

    const executor = createExecutor(def);
    const result = await executor.stepBatch("inst-1", { done: 1 }, {}, 10);
    expect(result.kind).toBe("idle");
  });

  it("throws on maxConcurrent < 1", async () => {
    type Place = "a" | "da";
    type Ctx = Record<string, unknown>;

    const def = defineWorkflow<Place, Ctx>({
      name: "validate-max",
      places: ["a", "da"],
      transitions: [
        { name: "do_a", type: "automatic", inputs: ["a"], outputs: ["da"], guard: null },
      ],
      initialMarking: { a: 1, da: 0 },
      initialContext: {},
      terminalPlaces: ["da"],
    });

    const executor = createExecutor(def);
    await expect(executor.stepBatch("inst-1", { a: 1, da: 0 }, {}, 0)).rejects.toThrow(
      "maxConcurrent must be >= 1",
    );
    await expect(executor.stepBatch("inst-1", { a: 1, da: 0 }, {}, -1)).rejects.toThrow(
      "maxConcurrent must be >= 1",
    );
  });

  it("respects maxConcurrent limit", async () => {
    type Place = "a" | "b" | "c" | "da" | "db" | "dc";
    type Ctx = { log: string[] };

    const def = defineWorkflow<Place, Ctx>({
      name: "limited-batch",
      places: ["a", "b", "c", "da", "db", "dc"],
      transitions: [
        {
          name: "do_a",
          type: "automatic",
          inputs: ["a"],
          outputs: ["da"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "a"] }),
        },
        {
          name: "do_b",
          type: "automatic",
          inputs: ["b"],
          outputs: ["db"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "b"] }),
        },
        {
          name: "do_c",
          type: "automatic",
          inputs: ["c"],
          outputs: ["dc"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "c"] }),
        },
      ],
      initialMarking: { a: 1, b: 1, c: 1, da: 0, db: 0, dc: 0 },
      initialContext: { log: [] },
      terminalPlaces: ["da", "db", "dc"],
    });

    const executor = createExecutor(def);
    const result = await executor.stepBatch(
      "inst-1",
      { a: 1, b: 1, c: 1, da: 0, db: 0, dc: 0 },
      { log: [] },
      2,
    );

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transitions).toHaveLength(2);
      expect(result.terminal).toBe(false); // one transition left
    }
  });
});

describe("Scheduler with maxConcurrent", () => {
  it("tick({ maxConcurrent }) fires multiple transitions per tick", async () => {
    type Place = "a" | "b" | "da" | "db";
    type Ctx = { log: string[] };

    const def = defineWorkflow<Place, Ctx>({
      name: "batch-sched",
      places: ["a", "b", "da", "db"],
      transitions: [
        {
          name: "do_a",
          type: "automatic",
          inputs: ["a"],
          outputs: ["da"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "a"] }),
        },
        {
          name: "do_b",
          type: "automatic",
          inputs: ["b"],
          outputs: ["db"],
          guard: null,
          execute: async (ctx) => ({ log: [...ctx.log, "b"] }),
        },
      ],
      initialMarking: { a: 1, b: 1, da: 0, db: 0 },
      initialContext: { log: [] },
      terminalPlaces: ["da", "db"],
    });

    const db = new Database(":memory:");
    const fired: string[] = [];
    const completed: string[] = [];

    const scheduler = new Scheduler(createExecutor(def), { adapter: sqliteAdapter(db, def.name) }, {
      onFire: (_id, name) => fired.push(name),
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("batch-1");
    const count = await scheduler.tick({ maxConcurrent: 10 });

    expect(count).toBe(2);
    expect(fired).toContain("do_a");
    expect(fired).toContain("do_b");
    expect(completed).toEqual(["batch-1"]);

    const state = await scheduler.inspect("batch-1");
    expect(state.status).toBe("completed");
    expect(state.marking).toEqual({ a: 0, b: 0, da: 1, db: 1 });
  });

  it("tick() without maxConcurrent still fires one at a time", async () => {
    type Place = "a" | "b" | "da" | "db";
    type Ctx = Record<string, unknown>;

    const def = defineWorkflow<Place, Ctx>({
      name: "seq-sched",
      places: ["a", "b", "da", "db"],
      transitions: [
        { name: "do_a", type: "automatic", inputs: ["a"], outputs: ["da"], guard: null },
        { name: "do_b", type: "automatic", inputs: ["b"], outputs: ["db"], guard: null },
      ],
      initialMarking: { a: 1, b: 1, da: 0, db: 0 },
      initialContext: {},
      terminalPlaces: ["da", "db"],
    });

    const db = new Database(":memory:");
    const scheduler = new Scheduler(createExecutor(def), { adapter: sqliteAdapter(db, def.name) });

    await scheduler.createInstance("seq-1");
    const count = await scheduler.tick();

    // Sequential: only one transition per tick
    expect(count).toBe(1);
  });
});
