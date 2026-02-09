import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  Scheduler,
  createExecutor,
  sqliteAdapter,
  toNet,
  checkInvariant,
  terminalStates,
  reachableStates,
  defineWorkflow,
} from "@petriflow/engine";
import { definition } from "./index.js";
import { analyse } from "@petriflow/engine";

describe("order-checkout workflow", () => {
  it("successfully processes an order with stock", async () => {
    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("order-1");

    for (let i = 0; i < 10; i++) {
      const n = await scheduler.tick();
      if (n === 0) break;
    }

    expect(fired).toContain("reserve_stock");
    expect(fired).toContain("process_payment");
    expect(fired).not.toContain("out_of_stock");

    const state = await scheduler.inspect("order-1");
    expect(state.status).toBe("completed");
    expect(state.context.paid).toBe(true);
    expect(state.marking.shipped).toBe(1);
  });

  it("rejects order when no inventory", async () => {
    const noStockDef = defineWorkflow({
      name: "order-no-stock",
      places: [
        "order_placed",
        "inventory",
        "reserved",
        "payment",
        "shipped",
        "out_of_stock",
      ] as const,
      transitions: definition.net.transitions,
      initialMarking: {
        order_placed: 1,
        inventory: 0, // no stock!
        reserved: 0,
        payment: 0,
        shipped: 0,
        out_of_stock: 0,
      },
      initialContext: {
        orderId: "order-empty",
        quantity: 1,
        paid: false,
      },
      terminalPlaces: ["shipped", "out_of_stock"],
    });

    const db = new Database(":memory:");
    const fired: string[] = [];

    const scheduler = new Scheduler(createExecutor(noStockDef), { adapter: sqliteAdapter(db, noStockDef.name) }, {
      onFire: (_id, name) => fired.push(name),
    });

    await scheduler.createInstance("no-stock-1");

    for (let i = 0; i < 10; i++) {
      const n = await scheduler.tick();
      if (n === 0) break;
    }

    expect(fired).toContain("out_of_stock");
    expect(fired).not.toContain("reserve_stock");

    const state = await scheduler.inspect("no-stock-1");
    expect(state.status).toBe("completed");
    expect(state.marking.out_of_stock).toBe(1);
  });

  it("inventory tokens are conserved (cannot oversell)", () => {
    const net = toNet(definition.net);
    // inventory + reserved + shipped should equal initial inventory
    const holds = checkInvariant(net, {
      inventory: 1,
      reserved: 1,
      shipped: 1,
    });
    expect(holds).toBe(true);
  });

  it("every order terminates", () => {
    const net = toNet(definition.net);
    const terminal = terminalStates(net);
    expect(terminal.length).toBeGreaterThan(0);

    // Every terminal state has token in shipped or out_of_stock
    for (const state of terminal) {
      const endTokens = (state.shipped ?? 0) + (state.out_of_stock ?? 0);
      expect(endTokens).toBeGreaterThanOrEqual(1);
    }
  });

  it("passes analyse (invariants read from definition)", () => {
    const result = analyse(definition);

    expect(result.reachableStateCount).toBeGreaterThan(0);
    expect(result.invariants[0]!.holds).toBe(true);
  });
});
