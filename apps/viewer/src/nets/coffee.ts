import { definition } from "@workflows/coffee/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const coffee: ViewerNet = {
  name: definition.name,
  description:
    "pourOver has three inputs — it needs hot water AND ground beans AND an empty cup. heatWater and grindBeans can fire in either order because their inputs are independent. Concurrency and synchronisation, expressed in data.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    waterCold: { category: "default", label: "Water (cold)" },
    waterHot: { category: "default", label: "Water (hot)" },
    beansWhole: { category: "default", label: "Beans (whole)" },
    beansGround: { category: "default", label: "Beans (ground)" },
    cupEmpty: { category: "default", label: "Cup (empty)" },
    coffeeReady: { category: "terminal", label: "Coffee Ready" },
  },
  intro: {
    title: "Concurrency & Synchronization",
    bullets: [
      "heatWater and grindBeans are independent — they can fire in either order without coordination.",
      "pourOver has three inputs, so it only fires when hot water, ground beans, and an empty cup are all present.",
      "No central orchestrator decides the order. Concurrency and synchronization emerge from the net structure.",
    ],
    tip: "Try clicking heatWater first, then grindBeans, then reload and reverse the order. Both paths reach the same result.",
  },
  deriveProperties: (analysis) => [
    {
      name: "Termination",
      holds: analysis.terminalStates.length > 0,
      description: `All paths produce coffee (${analysis.terminalStates.length} terminal state)`,
    },
    {
      name: "Concurrent preparation",
      holds: analysis.reachableStateCount > 2,
      description:
        "heatWater and grindBeans are independent — either can fire first",
    },
  ],
};
