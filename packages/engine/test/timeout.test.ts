import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { Scheduler } from "../src/scheduler.js";
import { defineWorkflow } from "../src/workflow.js";
import { createExecutor } from "../src/executor.js";
import { sqliteAdapter } from "../src/persistence/sqlite-adapter.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Workflow for timeout tests:
 *   waiting --[approve (guard: needs approval)]--> done
 *   waiting --[handle_timeout]--> expired
 *
 * "approve" is structurally enabled (token in "waiting") but guard-blocked.
 * It has a timeout that injects a token into "timed_out".
 * "handle_timeout" needs tokens in both "waiting" and "timed_out" to fire.
 */
type Place = "waiting" | "timed_out" | "done" | "expired";
type Ctx = { approved: boolean; result: string };

function makeTimeoutDef(timeoutMs: number, guardBlocked = true) {
  return defineWorkflow<Place, Ctx>({
    name: "timeout-test",
    places: ["waiting", "timed_out", "done", "expired"],
    transitions: [
      {
        name: "approve",
        inputs: ["waiting"],
        outputs: ["done"],
        guard: "approved",
        execute: async () => ({ result: "approved" }),
        timeout: { place: "timed_out" as Place, ms: timeoutMs },
      },
      {
        name: "handle_timeout",
        inputs: ["waiting", "timed_out"],
        outputs: ["expired"],
        execute: async () => ({ result: "expired" }),
      },
    ],
    initialMarking: { waiting: 1, timed_out: 0, done: 0, expired: 0 },
    initialContext: { approved: !guardBlocked, result: "" },
  });
}

describe("Timeout support", () => {
  it("fires timeout when guard blocks transition", async () => {
    const def = makeTimeoutDef(100);
    const db = new Database(":memory:");
    const adapter = sqliteAdapter<Place, Ctx>(db, def.name);
    const executor = createExecutor(def);

    const timeouts: string[] = [];
    const fired: string[] = [];
    const completed: string[] = [];

    const scheduler = new Scheduler(executor, { adapter }, {
      onTimeout: (_id, transitionName, place) => timeouts.push(`${transitionName}:${place}`),
      onFire: (_id, name) => fired.push(name),
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("inst-1");

    // First tick: approve is structurally enabled but guard-blocked → idle, schedules timeout
    await scheduler.tick();
    expect(fired).toHaveLength(0);

    // Instance should still be active (pending timeout)
    const stateAfterIdle = await scheduler.inspect("inst-1");
    expect(stateAfterIdle.status).toBe("active");

    // Wait for timeout to expire
    await sleep(150);

    // Second tick: timeout fires, injects token into "timed_out"
    await scheduler.tick();
    expect(timeouts).toEqual(["approve:timed_out"]);

    // handle_timeout should have fired (waiting + timed_out tokens present)
    expect(fired).toContain("handle_timeout");
    expect(completed).toContain("inst-1");

    const finalState = await scheduler.inspect("inst-1");
    expect(finalState.marking.expired).toBe(1);
    expect(finalState.context.result).toBe("expired");
  });

  it("normal fire cancels timeout", async () => {
    const def = makeTimeoutDef(200);
    const db = new Database(":memory:");
    const adapter = sqliteAdapter<Place, Ctx>(db, def.name);
    const executor = createExecutor(def);

    const timeouts: string[] = [];
    const fired: string[] = [];

    const scheduler = new Scheduler(executor, { adapter }, {
      onTimeout: (_id, transitionName) => timeouts.push(transitionName),
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("inst-2");

    // First tick: idle, schedules timeout
    await scheduler.tick();

    // Update context to unblock the guard — simulate external approval
    const state = await adapter.loadExtended("inst-2");
    await adapter.saveExtended("inst-2", { ...state, context: { ...state.context, approved: true } });

    // Tick: approve fires normally, cancels timeout
    await scheduler.tick();
    expect(fired).toContain("approve");

    // Wait past the original timeout
    await sleep(250);

    // Tick again: timeout should NOT fire
    await scheduler.tick();
    expect(timeouts).toHaveLength(0);

    const finalState = await scheduler.inspect("inst-2");
    expect(finalState.marking.done).toBe(1);
    expect(finalState.context.result).toBe("approved");
  });

  it("competing transition consumes tokens and clears timeout", async () => {
    type CPlace = "pending" | "alt_path" | "timed_out" | "done_a" | "done_b";
    type CCtx = Record<string, unknown>;

    const def = defineWorkflow<CPlace, CCtx>({
      name: "competing-test",
      places: ["pending", "alt_path", "timed_out", "done_a", "done_b"],
      transitions: [
        {
          name: "guarded",
          inputs: ["pending"],
          outputs: ["done_a"],
          guard: "0", // always blocked
          timeout: { place: "timed_out" as CPlace, ms: 100 },
        },
        {
          name: "alt",
          inputs: ["pending", "alt_path"],
          outputs: ["done_b"],
        },
      ],
      initialMarking: { pending: 1, alt_path: 0, timed_out: 0, done_a: 0, done_b: 0 },
      initialContext: {},
    });

    const db = new Database(":memory:");
    const adapter = sqliteAdapter<CPlace, CCtx>(db, def.name);
    const executor = createExecutor(def);
    const scheduler = new Scheduler(executor, { adapter }, {});

    await scheduler.createInstance("inst-3");

    // Tick: idle, schedules timeout for "guarded" (structurally enabled, guard-blocked)
    await scheduler.tick();

    // Inject alt_path token — "alt" transition now enabled
    await scheduler.injectToken("inst-3", "alt_path");

    // Tick: "alt" fires, consuming "pending" — "guarded" loses enablement, timeout cleared
    await scheduler.tick();

    // Wait past timeout
    await sleep(150);

    // Tick: no timeout should fire
    await scheduler.tick();

    const hasPending = await adapter.hasPendingTimeouts("inst-3");
    expect(hasPending).toBe(false);

    const finalState = await scheduler.inspect("inst-3");
    expect(finalState.marking.done_b).toBe(1);
  });

  it("hasPendingTimeouts keeps instance active", async () => {
    const def = makeTimeoutDef(500);
    const db = new Database(":memory:");
    const adapter = sqliteAdapter<Place, Ctx>(db, def.name);
    const executor = createExecutor(def);

    const completed: string[] = [];

    const scheduler = new Scheduler(executor, { adapter }, {
      onComplete: (id) => completed.push(id),
    });

    await scheduler.createInstance("inst-4");

    // Tick: idle but timeout scheduled — should NOT complete
    await scheduler.tick();

    const state = await scheduler.inspect("inst-4");
    expect(state.status).toBe("active");
    expect(completed).toHaveLength(0);

    const hasPending = await adapter.hasPendingTimeouts("inst-4");
    expect(hasPending).toBe(true);
  });

  it("getTimeoutCandidates returns structurally enabled timeout transitions", () => {
    const def = makeTimeoutDef(100);
    const executor = createExecutor(def);

    // With token in "waiting", approve is structurally enabled (single input)
    const candidates = executor.getTimeoutCandidates({ waiting: 1, timed_out: 0, done: 0, expired: 0 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.transitionName).toBe("approve");
    expect(candidates[0]!.place).toBe("timed_out");
    expect(candidates[0]!.ms).toBe(100);

    // Without token in "waiting", approve is NOT structurally enabled
    const candidates2 = executor.getTimeoutCandidates({ waiting: 0, timed_out: 0, done: 0, expired: 0 });
    expect(candidates2).toHaveLength(0);
  });

  it("rejects timeout referencing unknown place", () => {
    expect(() =>
      defineWorkflow({
        name: "bad-timeout",
        places: ["a", "b"],
        transitions: [
          {
            name: "t",
            inputs: ["a"],
            outputs: ["b"],
            timeout: { place: "nonexistent" as any, ms: 100 },
          },
        ],
        initialMarking: { a: 1, b: 0 } as any,
        initialContext: {},
      }),
    ).toThrow('Transition "t" timeout references unknown place "nonexistent"');
  });
});
