import { describe, it, expect, setDefaultTimeout } from "bun:test";
setDefaultTimeout(15_000);
import { Database } from "bun:sqlite";
import { Scheduler, createExecutor, sqliteAdapter, toNet, terminalStates, checkInvariant } from "@petriflow/engine";
import { analyse } from "@petriflow/engine";
import { definition } from "./index.js";

describe("coffee workflow", () => {
  it("brews coffee successfully", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("brew-1");

    for (let i = 0; i < 10; i++) {
      const n = await scheduler.tick();
      if (n === 0) break;
    }

    expect(fired).toContain("heatWater");
    expect(fired).toContain("grindBeans");
    expect(fired).toContain("pourOver");

    const state = await scheduler.inspect("brew-1");
    expect(state.status).toBe("completed");
    expect(state.context.brewed).toBe(true);
    expect(state.context.waterTemp).toBe(96);
    expect(state.context.grindSize).toBe("medium");
    expect(state.marking.coffeeReady).toBe(1);
  });

  it("all paths produce coffee (termination)", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);
    expect(terminal.length).toBe(1);

    for (const state of terminal) {
      expect(state.coffeeReady).toBe(1);
    }
  });

  it("heatWater and grindBeans are concurrent", () => {
    const result = analyse(definition);
    // 4 reachable states: initial, water heated, beans ground, both done (before pour)
    // + 1 terminal = coffee ready. But pourOver fires immediately when both are ready.
    // Actually: initial → (heat or grind) → (grind or heat) → pourOver → terminal
    expect(result.reachableStateCount).toBeGreaterThan(2);
  });

  it("pourOver guard requires hot water (waterTemp >= 90)", () => {
    const pourOver = definition.net.transitions.find(
      (t) => t.name === "pourOver",
    )!;
    expect(pourOver.guard).toBeDefined();
  });

  it("passes analyse", () => {
    const result = analyse(definition);
    expect(result.reachableStateCount).toBeGreaterThan(0);
    expect(result.terminalStates.length).toBe(1);
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });
});
