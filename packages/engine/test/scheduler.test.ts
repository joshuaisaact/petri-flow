import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { Scheduler } from "../src/scheduler.js";
import { defineWorkflow } from "../src/workflow.js";
import { createExecutor } from "../src/executor.js";
import { sqliteAdapter } from "../src/persistence/sqlite-adapter.js";

type Place = "start" | "step1" | "step2" | "end";
type Ctx = { log: string[] };

const definition = defineWorkflow<Place, Ctx>({
  name: "test-pipeline",
  places: ["start", "step1", "step2", "end"],
  transitions: [
    {
      name: "begin",
      inputs: ["start"],
      outputs: ["step1"],
      execute: async (ctx) => ({ log: [...ctx.log, "began"] }),
    },
    {
      name: "process",
      inputs: ["step1"],
      outputs: ["step2"],
      execute: async (ctx) => ({ log: [...ctx.log, "processed"] }),
    },
    {
      name: "complete",
      inputs: ["step2"],
      outputs: ["end"],
      execute: async (ctx) => ({ log: [...ctx.log, "completed"] }),
    },
  ],
  initialMarking: { start: 1, step1: 0, step2: 0, end: 0 },
  initialContext: { log: [] },
});

describe("Scheduler", () => {
  it("drives a workflow to completion via tick()", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];
    const completed: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onFire: (_id, name) => fired.push(name),
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("inst-1");

    // Tick through each step
    let totalFired = 0;
    for (let i = 0; i < 5; i++) {
      totalFired += await scheduler.tick();
    }

    expect(totalFired).toBe(3);
    expect(fired).toEqual(["begin", "process", "complete"]);
    expect(completed).toEqual(["inst-1"]);

    const state = await scheduler.inspect("inst-1");
    expect(state.status).toBe("completed");
    expect(state.marking).toEqual({ start: 0, step1: 0, step2: 0, end: 1 });
    expect(state.context.log).toEqual(["began", "processed", "completed"]);
  });

  it("handles multiple instances", async () => {
    const db = new Database(":memory:");
    const completed: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("a");
    await scheduler.createInstance("b");

    for (let i = 0; i < 10; i++) {
      await scheduler.tick();
    }

    expect(completed).toContain("a");
    expect(completed).toContain("b");

    const stateA = await scheduler.inspect("a");
    const stateB = await scheduler.inspect("b");
    expect(stateA.status).toBe("completed");
    expect(stateB.status).toBe("completed");
  });

  it("guards block transitions correctly", async () => {
    type GPlace = "pending" | "approved" | "denied";
    type GCtx = { score: number };

    const gatedDef = defineWorkflow<GPlace, GCtx>({
      name: "gated",
      places: ["pending", "approved", "denied"],
      transitions: [
        {
          name: "approve",
          inputs: ["pending"],
          outputs: ["approved"],
          guard: (ctx) => ctx.score >= 80,
        },
        {
          name: "deny",
          inputs: ["pending"],
          outputs: ["denied"],
          guard: (ctx) => ctx.score < 80,
        },
      ],
      initialMarking: { pending: 1, approved: 0, denied: 0 },
      initialContext: { score: 50 },
    });

    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(gatedDef), { adapter: sqliteAdapter(db, gatedDef.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("low-score");
    await scheduler.tick();

    expect(fired).toEqual(["deny"]);

    const state = await scheduler.inspect("low-score");
    expect(state.marking).toEqual({ pending: 0, approved: 0, denied: 1 });
  });

  it("handles execution errors gracefully", async () => {
    type EPlace = "start" | "end";
    type ECtx = Record<string, unknown>;

    const errorDef = defineWorkflow<EPlace, ECtx>({
      name: "error-wf",
      places: ["start", "end"],
      transitions: [
        {
          name: "explode",
          inputs: ["start"],
          outputs: ["end"],
          execute: async () => {
            throw new Error("boom");
          },
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
    });

    const db = new Database(":memory:");
    const errors: unknown[] = [];

    const scheduler = new Scheduler(createExecutor(errorDef), { adapter: sqliteAdapter(db, errorDef.name) }, {
      onError: (_id, err) => errors.push(err),
    });

    await scheduler.createInstance("err-1");
    await scheduler.tick();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");

    const state = await scheduler.inspect("err-1");
    expect(state.status).toBe("failed");
  });

  it("injectToken adds tokens and reactivates completed instances", async () => {
    type IPlace = "waiting" | "approved" | "done";
    type ICtx = { approvedBy: string };

    const waitDef = defineWorkflow<IPlace, ICtx>({
      name: "inject-test",
      places: ["waiting", "approved", "done"],
      transitions: [
        {
          name: "process",
          inputs: ["waiting", "approved"],
          outputs: ["done"],
          execute: async (ctx) => ({ approvedBy: "external" }),
        },
      ],
      initialMarking: { waiting: 1, approved: 0, done: 0 },
      initialContext: { approvedBy: "" },
    });

    const db = new Database(":memory:");
    const fired: string[] = [];
    const completed: string[] = [];

    const scheduler = new Scheduler(createExecutor(waitDef), { adapter: sqliteAdapter(db, waitDef.name) }, {
      onFire: (_id, name) => fired.push(name),
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("wait-1");

    // First tick: no transition enabled (need token in "approved")
    await scheduler.tick();
    expect(fired).toHaveLength(0);

    const stateAfterIdle = await scheduler.inspect("wait-1");
    expect(stateAfterIdle.status).toBe("completed");

    // Inject a token into "approved" — reactivates the instance
    await scheduler.injectToken("wait-1", "approved");

    const stateAfterInject = await scheduler.inspect("wait-1");
    expect(stateAfterInject.status).toBe("active");
    expect(stateAfterInject.marking.approved).toBe(1);

    // Now tick — "process" should fire
    await scheduler.tick();
    expect(fired).toEqual(["process"]);
    expect(completed).toContain("wait-1");

    const finalState = await scheduler.inspect("wait-1");
    expect(finalState.status).toBe("completed");
    expect(finalState.marking.done).toBe(1);
    expect(finalState.context.approvedBy).toBe("external");
  });

  it("rejects duplicate instance IDs", async () => {
    const db = new Database(":memory:");
    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) });

    await scheduler.createInstance("dup-1");
    await expect(scheduler.createInstance("dup-1")).rejects.toThrow(
      "Instance already exists: dup-1",
    );
  });

  it("records transition history", async () => {
    const db = new Database(":memory:");
    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) });

    await scheduler.createInstance("hist-1");
    for (let i = 0; i < 5; i++) {
      await scheduler.tick();
    }

    const history = await scheduler.getHistory("hist-1");
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.transitionName)).toEqual(["begin", "process", "complete"]);

    // Each entry has before/after markings
    const first = history[0]!;
    expect(first.markingBefore.start).toBe(1);
    expect(first.markingAfter.start).toBe(0);
    expect(first.markingAfter.step1).toBe(1);
    expect(first.workflowName).toBe("test-pipeline");
    expect(first.firedAt).toBeGreaterThan(0);
  });
});
