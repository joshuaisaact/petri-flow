import { describe, it, expect, setDefaultTimeout } from "bun:test";
setDefaultTimeout(30_000);
import { Database } from "bun:sqlite";
import { Scheduler, createExecutor, sqliteAdapter, toNet, terminalStates, reachableStates } from "@petriflow/engine";
import { analyse } from "@petriflow/engine";
import { definition, ITERATION_BUDGET } from "./index.js";

describe("simple-agent workflow", () => {
  it("drives agent to completion via tick()", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("agent-1");

    for (let i = 0; i < 50; i++) {
      const n = await scheduler.tick();
      if (n === 0) break;
    }

    expect(fired).toContain("plan");
    expect(fired).toContain("dispatchTool");
    expect(fired).toContain("completeTool");
    expect(fired).toContain("generate");

    const state = await scheduler.inspect("agent-1");
    expect(state.status).toBe("completed");
    expect(state.marking.responseGenerated).toBe(1);
  });

  it("terminates — all terminal states are responseGenerated", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);
    expect(terminal.length).toBeGreaterThan(0);

    for (const state of terminal) {
      expect(state.responseGenerated).toBe(1);
    }
  });

  it("reachable state space is finite", () => {
    const result = analyse(definition);
    expect(result.reachableStateCount).toBeGreaterThan(0);
    expect(result.reachableStateCount).toBeLessThan(10000);
  });

  it(`iteration budget limits loops to ${ITERATION_BUDGET}`, () => {
    const net = toNet(definition.net);
    const reachable = reachableStates(net);

    for (const state of reachable) {
      expect(state.iterationBudget).toBeGreaterThanOrEqual(0);
      expect(state.iterationBudget).toBeLessThanOrEqual(ITERATION_BUDGET);
    }
  });

  it("iterate cannot fire when budget is exhausted", () => {
    const net = toNet(definition.net);
    const reachable = reachableStates(net);
    const terminal = terminalStates(net);

    for (const state of reachable) {
      if (state.resultsReady > 0 && state.iterationBudget === 0) {
        const isTerminal = terminal.some(
          (t) => JSON.stringify(t) === JSON.stringify(state),
        );
        expect(isTerminal).toBe(false);
      }
    }
  });

  it("no unexpected terminal states", () => {
    const result = analyse(definition);
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  it("completeTool and generate have execute handlers", () => {
    expect(definition.executors.has("completeTool")).toBe(true);
    expect(definition.executors.has("generate")).toBe(true);
    expect(definition.executors.has("iterate")).toBe(true);
  });
});
