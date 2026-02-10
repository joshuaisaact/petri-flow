import { defineWorkflow } from "@petriflow/engine/workflow";

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
      type: "automatic",
      inputs: ["order_placed", "inventory"],
      outputs: ["reserved", "payment"],
      guard: null,
    },
    {
      name: "process_payment",
      type: "http",
      inputs: ["payment", "reserved"],
      outputs: ["shipped"],
      guard: null,
      config: { url: "https://payments.example.com/charge", method: "POST" },
      execute: async (ctx) => ({
        paid: true,
      }),
    },
    {
      name: "out_of_stock",
      type: "automatic",
      inputs: ["order_placed"],
      outputs: ["out_of_stock"],
      guard: "marking.inventory == 0",
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
