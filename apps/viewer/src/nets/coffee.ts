import type { ViewerNet } from "../types";

export const coffee: ViewerNet = {
  name: "coffee",
  description:
    "pourOver has three inputs — it needs hot water AND ground beans AND an empty cup. heatWater and grindBeans can fire in either order because their inputs are independent. Concurrency and synchronisation, expressed in data.",
  net: {
    transitions: [
      {
        name: "heatWater",
        inputs: ["waterCold"],
        outputs: ["waterHot"],
      },
      {
        name: "grindBeans",
        inputs: ["beansWhole"],
        outputs: ["beansGround"],
      },
      {
        name: "pourOver",
        inputs: ["waterHot", "beansGround", "cupEmpty"],
        outputs: ["coffeeReady"],
      },
    ],
    initialMarking: {
      waterCold: 1,
      waterHot: 0,
      beansWhole: 1,
      beansGround: 0,
      cupEmpty: 1,
      coffeeReady: 0,
    },
  },
  placeMetadata: {
    waterCold: { category: "default", label: "Water (cold)" },
    waterHot: { category: "default", label: "Water (hot)" },
    beansWhole: { category: "default", label: "Beans (whole)" },
    beansGround: { category: "default", label: "Beans (ground)" },
    cupEmpty: { category: "resource", label: "Cup (empty)" },
    coffeeReady: { category: "terminal", label: "Coffee Ready" },
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
