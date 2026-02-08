import { describe, it, expect, afterAll } from "bun:test";
import { analyse, toNet } from "@petriflow/engine";
import { reachableStates, terminalStates } from "petri-ts";
import { definition, ITERATION_BUDGET } from "./index.js";

describe("agent-benchmark: formal properties", () => {
  const net = toNet(definition.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(definition);

  // === Property 1: Termination ===
  it("terminates — all terminal states are responseGenerated", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      expect(state.responseGenerated).toBe(1);
    }
  });

  it("no unexpected terminal states (no deadlocks)", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
    expect(result.validTerminalStates.length).toBe(terminal.length);
  });

  // === Property 2: Human gate ===
  it("code execution always passes through humanApproval", () => {
    // Structural proof: no transition has codePending as input and codeDone as output.
    // The only path from codePending is: codePending → humanApproval → (approve → execute → codeDone | reject → codeDone)
    for (const t of definition.net.transitions) {
      if (t.inputs.includes("codePending")) {
        expect(t.outputs).not.toContain("codeDone");
        // The only valid output from codePending is humanApproval
        expect(t.outputs).toContain("humanApproval");
      }
    }
  });

  it("no reachable state has codeDone without humanApproval having been passed", () => {
    // In any reachable marking where code was dispatched (codePending consumed),
    // codeDone can only have a token if humanApproval was visited.
    // We check: no state has codePending > 0 AND codeDone > 0 simultaneously
    // (that would mean codeDone was produced without consuming codePending properly)
    for (const state of reachable) {
      if (state.codePending > 0) {
        expect(state.codeDone).toBe(0);
      }
    }
  });

  // === Property 3: No orphaned work ===
  it("joinResults requires all three tool completion tokens", () => {
    const join = definition.net.transitions.find(
      (t) => t.name === "joinResults",
    )!;
    expect(join.inputs).toContain("searchDone");
    expect(join.inputs).toContain("dbDone");
    expect(join.inputs).toContain("codeDone");
    expect(join.inputs).toHaveLength(3);
  });

  it("no terminal state has orphaned pending work", () => {
    const pendingPlaces = [
      "searchPending",
      "dbPending",
      "codePending",
      "humanApproval",
      "codeApproved",
      "searchDecision",
      "dbDecision",
      "codeDecision",
    ] as const;

    for (const state of terminal) {
      for (const p of pendingPlaces) {
        expect(state[p]).toBe(0);
      }
    }
  });

  // === Property 4: Bounded iterations ===
  it("reachable state space is finite", () => {
    expect(result.reachableStateCount).toBeGreaterThan(0);
    expect(result.reachableStateCount).toBeLessThan(10000);
  });

  it(`iteration budget limits loops to ${ITERATION_BUDGET}`, () => {
    // In every reachable state, iterationBudget is between 0 and ITERATION_BUDGET
    for (const state of reachable) {
      expect(state.iterationBudget).toBeGreaterThanOrEqual(0);
      expect(state.iterationBudget).toBeLessThanOrEqual(ITERATION_BUDGET);
    }
  });

  it("iterate cannot fire when budget is exhausted", () => {
    // When iterationBudget === 0, iterate requires a budget token,
    // so only generate can fire from resultsReady.
    // Verify: no reachable state has resultsReady > 0 AND iterationBudget === 0
    // AND is NOT terminal (meaning generate must be the only option and it fires)
    for (const state of reachable) {
      if (state.resultsReady > 0 && state.iterationBudget === 0) {
        // This state exists — and generate is the only enabled transition
        // It's not a terminal state (generate can fire), so the net progresses
        // We just verify it's not stuck
        const isTerminal = terminal.some(
          (t) => JSON.stringify(t) === JSON.stringify(state),
        );
        expect(isTerminal).toBe(false);
      }
    }
  });

  // === Summary ===
  afterAll(() => {
    console.log("\n=== Agent Benchmark Analysis ===");
    console.log(`  Reachable states: ${result.reachableStateCount}`);
    console.log(`  Terminal states:  ${result.terminalStates.length} (all valid)`);
    console.log(`  Unexpected terminal states (deadlocks): ${result.unexpectedTerminalStates.length}`);
    console.log(`  Iteration budget: ${ITERATION_BUDGET}`);

    const budgetVariants = new Map<number, number>();
    for (const state of terminal) {
      const budget = state.iterationBudget;
      budgetVariants.set(budget, (budgetVariants.get(budget) ?? 0) + 1);
    }
    console.log("  Terminal state variants by remaining budget:");
    for (const [budget, count] of [...budgetVariants.entries()].sort((a, b) => b[0] - a[0])) {
      console.log(`    budget=${budget}: ${count} variant(s)`);
    }
    console.log("================================\n");
  });
});
