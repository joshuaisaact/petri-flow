import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "userQuery"
  | "planReady"
  | "toolPending"
  | "resultsReady"
  | "responseGenerated"
  | "iterationBudget";

type Ctx = {
  query: string;
  toolResult?: string;
  response?: string;
  iteration: number;
};

export const ITERATION_BUDGET = 2;

export const definition = defineWorkflow<Place, Ctx>({
  name: "simple-agent",
  places: [
    "userQuery",
    "planReady",
    "toolPending",
    "resultsReady",
    "responseGenerated",
    "iterationBudget",
  ],
  transitions: [
    {
      name: "plan",
      inputs: ["userQuery"],
      outputs: ["planReady"],
    },
    {
      name: "dispatchTool",
      inputs: ["planReady"],
      outputs: ["toolPending"],
    },
    {
      name: "completeTool",
      inputs: ["toolPending"],
      outputs: ["resultsReady"],
      execute: async (ctx) => ({
        toolResult: `tool result for iteration ${ctx.iteration}`,
      }),
    },
    {
      name: "generate",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
      execute: async (ctx) => ({
        response: `Response after ${ctx.iteration} iteration(s)`,
      }),
    },
    {
      name: "iterate",
      inputs: ["resultsReady", "iterationBudget"],
      outputs: ["userQuery"],
      execute: async (ctx) => ({
        iteration: ctx.iteration + 1,
      }),
    },
  ],
  initialMarking: {
    userQuery: 1,
    planReady: 0,
    toolPending: 0,
    resultsReady: 0,
    responseGenerated: 0,
    iterationBudget: ITERATION_BUDGET,
  },
  initialContext: {
    query: "What is the weather today?",
    iteration: 0,
  },
  terminalPlaces: ["responseGenerated"],
});

export default definition;
