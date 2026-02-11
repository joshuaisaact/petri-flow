import { definition } from "@workflows/order-checkout/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const orderCheckout: ViewerNet = {
  name: definition.name,
  description:
    "Inventory tokens model limited stock. The reserve transition consumes from both order_placed AND inventory, modeling resource contention. This is something DAG-based tools cannot model.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    order_placed: { category: "default", label: "Order Placed" },
    inventory: { category: "resource", label: "Inventory" },
    reserved: { category: "default", label: "Reserved" },
    payment: { category: "default", label: "Payment" },
    shipped: { category: "terminal", label: "Shipped" },
    out_of_stock: { category: "terminal", label: "Out of Stock" },
  },
  intro: {
    title: "Resource Contention",
    bullets: [
      "Inventory tokens represent limited stock. The reserve transition consumes from both order_placed and inventory.",
      "When inventory hits zero, the out_of_stock guard fires instead — overselling is structurally impossible.",
      "An invariant proves that inventory + reserved + shipped is constant across all reachable states.",
    ],
    tip: "This is something DAG-based workflow tools cannot model — resource contention requires tokens.",
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
