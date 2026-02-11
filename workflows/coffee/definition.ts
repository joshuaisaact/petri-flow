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
      type: "script",
      inputs: ["waterCold"],
      outputs: ["waterHot"],
      guard: null,
      config: { code: "ctx.waterTemp = 96" },
      execute: async (ctx) => {
        await new Promise((r) => setTimeout(r, 2000));
        return { waterTemp: 96 };
      },
    },
    {
      name: "grindBeans",
      type: "script",
      inputs: ["beansWhole"],
      outputs: ["beansGround"],
      guard: null,
      config: { code: "ctx.grindSize = 'medium'" },
      execute: async (ctx) => {
        await new Promise((r) => setTimeout(r, 1000));
        return { grindSize: "medium" };
      },
    },
    {
      name: "pourOver",
      type: "script",
      inputs: ["waterHot", "beansGround", "cupEmpty"],
      outputs: ["coffeeReady"],
      guard: "waterTemp >= 90",
      config: { code: "ctx.brewed = true" },
      execute: async (ctx) => {
        await new Promise((r) => setTimeout(r, 3000));
        return { brewed: true };
      },
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
