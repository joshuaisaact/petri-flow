import { defineWorkflow, Scheduler } from "@petriflow/engine";
import { Database } from "bun:sqlite";

/**
 * Order Checkout Workflow
 *
 * Inventory tokens model limited stock. The `reserve` transition consumes
 * from both `order_placed` AND `inventory`, modeling resource contention.
 * This is something DAG-based tools cannot model — the inventory place
 * acts as a shared resource across workflow instances.
 *
 * Proves: cannot oversell (inventory invariant), every order terminates.
 *
 * Places:
 *   order_placed  - new order waiting for processing
 *   inventory     - available stock (starts with N tokens)
 *   reserved      - stock reserved for this order
 *   payment       - awaiting payment
 *   shipped       - order shipped
 *   out_of_stock  - order could not be fulfilled
 */
type Place =
  | "order_placed"
  | "inventory"
  | "reserved"
  | "payment"
  | "shipped"
  | "out_of_stock";

type Ctx = {
  orderId: string;
  quantity: number;
  paid: boolean;
};

export const definition = defineWorkflow<Place, Ctx>({
  name: "order-checkout",
  places: [
    "order_placed",
    "inventory",
    "reserved",
    "payment",
    "shipped",
    "out_of_stock",
  ],
  transitions: [
    {
      name: "reserve_stock",
      inputs: ["order_placed", "inventory"],
      outputs: ["reserved", "payment"],
    },
    {
      name: "process_payment",
      inputs: ["payment", "reserved"],
      outputs: ["shipped"],
      execute: async (ctx) => ({
        paid: true,
      }),
    },
    {
      name: "out_of_stock",
      inputs: ["order_placed"],
      outputs: ["out_of_stock"],
      guard: (_ctx, marking) => marking["inventory"] === 0,
    },
  ],
  initialMarking: {
    order_placed: 1,
    inventory: 3, // 3 units of stock
    reserved: 0,
    payment: 0,
    shipped: 0,
    out_of_stock: 0,
  },
  initialContext: {
    orderId: "order-001",
    quantity: 1,
    paid: false,
  },
  terminalPlaces: ["shipped", "out_of_stock"],
  // Inventory + reserved + shipped = initial inventory (tokens conserved from inventory pool)
  invariants: [
    {
      weights: {
        inventory: 1,
        reserved: 1,
        shipped: 1,
      },
    },
  ],
});

export default definition;

if (import.meta.main) {
  const db = new Database(":memory:");
  const scheduler = new Scheduler(definition, { db }, {
    onFire: (id, name, result) => {
      console.log(`[${id}] fired: ${name}`);
      console.log(`  marking:`, result.marking);
    },
    onComplete: (id) => console.log(`[${id}] ✓ completed`),
    onError: (id, err) => console.error(`[${id}] ✗ error:`, err),
  });

  await scheduler.createInstance("order-001");

  for (let i = 0; i < 10; i++) {
    const fired = await scheduler.tick();
    if (fired === 0) break;
  }

  const state = await scheduler.inspect("order-001");
  console.log("\nFinal state:", state);
}
