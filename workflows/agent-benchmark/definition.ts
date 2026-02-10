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
      type: "ai",
      inputs: ["userQuery"],
      outputs: ["planReady"],
      guard: null,
      config: { model: "claude-sonnet-4-20250514", prompt: "Analyze the query and decide which tools to use.", temperature: 0.7 },
    },

    // Fan-out: distribute planReady to per-tool decision points
    {
      name: "distribute",
      type: "automatic",
      inputs: ["planReady"],
      outputs: ["searchDecision", "dbDecision", "codeDecision"],
      guard: null,
    },

    // === Search tool ===
    {
      name: "dispatchSearch",
      type: "http",
      inputs: ["searchDecision"],
      outputs: ["searchPending"],
      guard: null,
      config: { url: "https://search.example.com/query", method: "POST" },
    },
    {
      name: "skipSearch",
      type: "automatic",
      inputs: ["searchDecision"],
      outputs: ["searchDone"],
      guard: null,
    },
    {
      name: "completeSearch",
      type: "http",
      inputs: ["searchPending"],
      outputs: ["searchDone"],
      guard: null,
      config: { url: "https://search.example.com/result", method: "GET" },
      execute: async (ctx) => ({
        searchResult: "search: found 3 results",
      }),
    },

    // === Database tool ===
    {
      name: "dispatchDB",
      type: "http",
      inputs: ["dbDecision"],
      outputs: ["dbPending"],
      guard: null,
      config: { url: "https://db.example.com/query", method: "POST" },
    },
    {
      name: "skipDB",
      type: "automatic",
      inputs: ["dbDecision"],
      outputs: ["dbDone"],
      guard: null,
    },
    {
      name: "completeDB",
      type: "http",
      inputs: ["dbPending"],
      outputs: ["dbDone"],
      guard: null,
      config: { url: "https://db.example.com/result", method: "GET" },
      execute: async (ctx) => ({
        dbResult: "db: 42 rows matched",
      }),
    },

    // === Code execution tool (dangerous — requires human approval) ===
    {
      name: "dispatchCode",
      type: "automatic",
      inputs: ["codeDecision"],
      outputs: ["codePending"],
      guard: null,
    },
    {
      name: "skipCode",
      type: "automatic",
      inputs: ["codeDecision"],
      outputs: ["codeDone"],
      guard: null,
    },
    {
      name: "requestApproval",
      type: "automatic",
      inputs: ["codePending"],
      outputs: ["humanApproval"],
      guard: null,
    },
    {
      name: "approveCode",
      type: "manual",
      inputs: ["humanApproval"],
      outputs: ["codeApproved"],
      guard: null,
      config: { label: "Approve" },
    },
    {
      name: "rejectCode",
      type: "manual",
      inputs: ["humanApproval"],
      outputs: ["codeDone"],
      guard: null,
      config: { label: "Reject" },
    },
    {
      name: "executeCode",
      type: "script",
      inputs: ["codeApproved"],
      outputs: ["codeDone"],
      guard: null,
      config: { code: "// Execute sandboxed code\nresult = eval(ctx.codeSnippet)" },
      execute: async (ctx) => ({
        codeResult: "code: executed successfully",
      }),
    },

    // === Join + Decision ===
    {
      name: "joinResults",
      type: "automatic",
      inputs: ["searchDone", "dbDone", "codeDone"],
      outputs: ["resultsReady"],
      guard: null,
    },

    // Generate response — does NOT consume iterationBudget
    // When budget is exhausted, this is the only enabled transition
    {
      name: "generate",
      type: "ai",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
      guard: null,
      config: { model: "claude-sonnet-4-20250514", prompt: "Synthesize results into a final response.", temperature: 0.5 },
      execute: async (ctx) => ({
        response: `Response after ${ctx.iteration} iteration(s)`,
      }),
    },

    // Iterate — consumes one budget token, loops back to userQuery
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
