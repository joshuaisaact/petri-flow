import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "userQuery"
  | "planReady"
  | "searchDecision"
  | "dbDecision"
  | "codeDecision"
  | "searchPending"
  | "searchDone"
  | "dbPending"
  | "dbDone"
  | "codePending"
  | "humanApproval"
  | "codeApproved"
  | "codeDone"
  | "resultsReady"
  | "responseGenerated"
  | "iterationBudget";

type Ctx = {
  query: string;
  searchResult?: string;
  dbResult?: string;
  codeResult?: string;
  response?: string;
  iteration: number;
};

export const ITERATION_BUDGET = 3;

export const definition = defineWorkflow<Place, Ctx>({
  name: "agent-benchmark",
  places: [
    "userQuery",
    "planReady",
    "searchDecision",
    "dbDecision",
    "codeDecision",
    "searchPending",
    "searchDone",
    "dbPending",
    "dbDone",
    "codePending",
    "humanApproval",
    "codeApproved",
    "codeDone",
    "resultsReady",
    "responseGenerated",
    "iterationBudget",
  ],
  transitions: [
    // === Planning ===
    {
      name: "plan",
      inputs: ["userQuery"],
      outputs: ["planReady"],
    },

    // Fan-out: distribute planReady to per-tool decision points
    {
      name: "distribute",
      inputs: ["planReady"],
      outputs: ["searchDecision", "dbDecision", "codeDecision"],
    },

    // === Search tool ===
    {
      name: "dispatchSearch",
      inputs: ["searchDecision"],
      outputs: ["searchPending"],
    },
    {
      name: "skipSearch",
      inputs: ["searchDecision"],
      outputs: ["searchDone"],
    },
    {
      name: "completeSearch",
      inputs: ["searchPending"],
      outputs: ["searchDone"],
      execute: async (ctx) => ({
        searchResult: "search: found 3 results",
      }),
    },

    // === Database tool ===
    {
      name: "dispatchDB",
      inputs: ["dbDecision"],
      outputs: ["dbPending"],
    },
    {
      name: "skipDB",
      inputs: ["dbDecision"],
      outputs: ["dbDone"],
    },
    {
      name: "completeDB",
      inputs: ["dbPending"],
      outputs: ["dbDone"],
      execute: async (ctx) => ({
        dbResult: "db: 42 rows matched",
      }),
    },

    // === Code execution tool (dangerous — requires human approval) ===
    {
      name: "dispatchCode",
      inputs: ["codeDecision"],
      outputs: ["codePending"],
    },
    {
      name: "skipCode",
      inputs: ["codeDecision"],
      outputs: ["codeDone"],
    },
    {
      name: "requestApproval",
      inputs: ["codePending"],
      outputs: ["humanApproval"],
    },
    {
      name: "approveCode",
      inputs: ["humanApproval"],
      outputs: ["codeApproved"],
    },
    {
      name: "rejectCode",
      inputs: ["humanApproval"],
      outputs: ["codeDone"],
    },
    {
      name: "executeCode",
      inputs: ["codeApproved"],
      outputs: ["codeDone"],
      execute: async (ctx) => ({
        codeResult: "code: executed successfully",
      }),
    },

    // === Join + Decision ===
    {
      name: "joinResults",
      inputs: ["searchDone", "dbDone", "codeDone"],
      outputs: ["resultsReady"],
    },

    // Generate response — does NOT consume iterationBudget
    // When budget is exhausted, this is the only enabled transition
    {
      name: "generate",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
      execute: async (ctx) => ({
        response: `Response after ${ctx.iteration} iteration(s)`,
      }),
    },

    // Iterate — consumes one budget token, loops back to userQuery
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
    searchDecision: 0,
    dbDecision: 0,
    codeDecision: 0,
    searchPending: 0,
    searchDone: 0,
    dbPending: 0,
    dbDone: 0,
    codePending: 0,
    humanApproval: 0,
    codeApproved: 0,
    codeDone: 0,
    resultsReady: 0,
    responseGenerated: 0,
    iterationBudget: ITERATION_BUDGET,
  },
  initialContext: {
    query: "What were last quarter's sales figures?",
    iteration: 0,
  },
  terminalPlaces: ["responseGenerated"],
});

export default definition;
