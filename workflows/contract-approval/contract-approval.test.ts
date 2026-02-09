import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  Scheduler,
  createExecutor,
  sqliteAdapter,
  toNet,
  terminalStates,
  reachableStates,
} from "@petriflow/engine";
import { analyse } from "@petriflow/engine";
import { definition } from "./index.js";

describe("contract-approval workflow", () => {
  it("executes contract when both approve", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("contract-1");

    for (let i = 0; i < 10; i++) {
      const n = await scheduler.tick();
      if (n === 0) break;
    }

    expect(fired).toContain("submit");
    expect(fired).toContain("approveFinance");
    expect(fired).toContain("approveLegal");
    expect(fired).toContain("execute");

    const state = await scheduler.inspect("contract-1");
    expect(state.status).toBe("completed");
    expect(state.marking.executed).toBe(1);
  });

  it("contract cannot execute if finance rejects", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);

    // Any terminal state with financeRejected should NOT have executed
    for (const state of terminal) {
      if (state.financeRejected > 0) {
        expect(state.executed).toBe(0);
      }
    }
  });

  it("contract cannot execute if legal rejects", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);

    for (const state of terminal) {
      if (state.legalRejected > 0) {
        expect(state.executed).toBe(0);
      }
    }
  });

  it("every contract terminates (no stuck states)", () => {
    const result = analyse(definition);
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  it("has exactly 4 terminal states", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);
    // both approve, finance rejects, legal rejects, both reject
    expect(terminal).toHaveLength(4);
  });

  it("finance and legal review concurrently", () => {
    const net = toNet(definition.net);
    const states = reachableStates(net);
    // After submit, both approveFinance and approveLegal are enabled
    // so there must be states where one has fired but not the other
    const financeFirst = states.some(
      (s) => s.financeApproved > 0 && s.awaitingLegal > 0,
    );
    const legalFirst = states.some(
      (s) => s.legalApproved > 0 && s.awaitingFinance > 0,
    );
    expect(financeFirst).toBe(true);
    expect(legalFirst).toBe(true);
  });

  it("finance track tokens are conserved (invariant)", () => {
    const result = analyse(definition);
    expect(result.invariants[0]!.holds).toBe(true);
  });

  it("passes analyse", () => {
    const result = analyse(definition);
    expect(result.reachableStateCount).toBeGreaterThan(0);
    expect(result.terminalStates).toHaveLength(4);
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });
});
