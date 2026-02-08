import type { ViewerNet } from "../types";

export const orderCheckout: ViewerNet = {
  name: "order-checkout",
  description:
    "Inventory tokens model limited stock. The reserve transition consumes from both order_placed AND inventory, modeling resource contention. This is something DAG-based tools cannot model.",
  net: {
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
      },
      {
        name: "out_of_stock",
        inputs: ["order_placed"],
        outputs: ["out_of_stock"],
      },
    ],
    initialMarking: {
      order_placed: 1,
      inventory: 3,
      reserved: 0,
      payment: 0,
      shipped: 0,
      out_of_stock: 0,
    },
  },
  placeMetadata: {
    order_placed: { category: "default", label: "Order Placed" },
    inventory: { category: "resource", label: "Inventory" },
    reserved: { category: "default", label: "Reserved" },
    payment: { category: "default", label: "Payment" },
    shipped: { category: "terminal", label: "Shipped" },
    out_of_stock: { category: "terminal", label: "Out of Stock" },
  },
  invariants: [
    {
      weights: { inventory: 1, reserved: 1, shipped: 1 },
      label: "Inventory conservation (inv + reserved + shipped = const)",
    },
  ],
  deriveProperties: (analysis) => [
    {
      name: "Termination",
      holds: analysis.terminalStates.length > 0,
      description: `All paths terminate (${analysis.terminalStates.length} terminal state${analysis.terminalStates.length === 1 ? "" : "s"})`,
    },
    {
      name: "Cannot oversell",
      holds:
        analysis.invariants.length > 0 && analysis.invariants[0]!.holds,
      description: "Inventory conservation invariant holds across all reachable states",
    },
  ],
};
