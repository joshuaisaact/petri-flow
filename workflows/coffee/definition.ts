import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "waterCold"
  | "waterHot"
  | "beansWhole"
  | "beansGround"
  | "cupEmpty"
  | "coffeeReady";

type Ctx = {
  waterTemp: number;
  grindSize: string;
  brewed: boolean;
};

export const definition = defineWorkflow<Place, Ctx>({
  name: "coffee",
  places: [
    "waterCold",
    "waterHot",
    "beansWhole",
    "beansGround",
    "cupEmpty",
    "coffeeReady",
  ],
  transitions: [
    {
      name: "heatWater",
      inputs: ["waterCold"],
      outputs: ["waterHot"],
      execute: async (ctx) => ({
        waterTemp: 96,
      }),
    },
    {
      name: "grindBeans",
      inputs: ["beansWhole"],
      outputs: ["beansGround"],
      execute: async (ctx) => ({
        grindSize: "medium",
      }),
    },
    {
      name: "pourOver",
      inputs: ["waterHot", "beansGround", "cupEmpty"],
      outputs: ["coffeeReady"],
      guard: (ctx) => ctx.waterTemp >= 90,
      execute: async (ctx) => ({
        brewed: true,
      }),
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
  initialContext: {
    waterTemp: 20,
    grindSize: "none",
    brewed: false,
  },
  terminalPlaces: ["coffeeReady"],
});

export default definition;
