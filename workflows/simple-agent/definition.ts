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
      type: "ai",
      inputs: ["userQuery"],
      outputs: ["planReady"],
      guard: null,
      config: { model: "claude-sonnet-4-20250514", prompt: "Analyze the user query and produce a plan.", temperature: 0.7 },
    },
    {
      name: "dispatchTool",
      type: "http",
      inputs: ["planReady"],
      outputs: ["toolPending"],
      guard: null,
      config: { url: "https://tools.example.com/dispatch", method: "POST" },
    },
    {
      name: "completeTool",
      type: "http",
      inputs: ["toolPending"],
      outputs: ["resultsReady"],
      guard: null,
      config: { url: "https://tools.example.com/result", method: "GET" },
      execute: async (ctx) => ({
        toolResult: `tool result for iteration ${ctx.iteration}`,
      }),
    },
    {
      name: "generate",
      type: "ai",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
      guard: null,
      config: { model: "claude-sonnet-4-20250514", prompt: "Generate a response based on tool results.", temperature: 0.5 },
      execute: async (ctx) => ({
        response: `Response after ${ctx.iteration} iteration(s)`,
      }),
    },
    {
      name: "iterate",
      type: "automatic",
      inputs: ["resultsReady", "iterationBudget"],
      outputs: ["userQuery"],
      guard: null,
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
