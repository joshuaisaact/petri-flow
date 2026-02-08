import { defineWorkflow, Scheduler } from "@petriflow/engine";
import { Database } from "bun:sqlite";

/**
 * Agent Benchmark Workflow
 *
 * Models an LLM agent loop as a Petri net. The LLM picks actions.
 * The net enforces the rules. We prove properties about the orchestration
 * that hold regardless of what the LLM decides.
 *
 * Setup: Agent receives a user question. Has three tools:
 *   - Web search (safe, no approval needed)
 *   - Database lookup (safe, no approval needed)
 *   - Code execution (dangerous, requires human approval)
 *
 * Fan-out: After planning, the agent decides which tools to call.
 *   Each tool has a dispatch/skip pair — the LLM chooses a subset.
 *   joinResults blocks until ALL dispatched/skipped tools complete.
 *
 * Iteration: After results, the agent can loop back (consuming budget)
 *   or generate a response. Budget enforces termination structurally.
 *
 * Places:
 *   userQuery        - initial user question
 *   planReady        - agent has planned which tools to call
 *   searchDecision   - pending decision: dispatch or skip search
 *   dbDecision       - pending decision: dispatch or skip DB
 *   codeDecision     - pending decision: dispatch or skip code
 *   searchPending    - web search running
 *   searchDone       - web search result available
 *   dbPending        - database lookup running
 *   dbDone           - database result available
 *   codePending      - code execution requested
 *   humanApproval    - awaiting human approval for code execution
 *   codeApproved     - human approved, code can execute
 *   codeDone         - code execution result available (or skipped/rejected)
 *   resultsReady     - all tool results collected (join point)
 *   responseGenerated - final response produced (terminal)
 *   iterationBudget  - tokens limiting iteration count (starts at 3)
 *
 * Proves:
 *   1. Termination — every path reaches responseGenerated
 *   2. Human gate — code execution always passes through humanApproval
 *   3. No orphaned work — joinResults blocks until all tools complete
 *   4. Bounded iterations — at most 3 iterations (budget enforced)
 */
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

if (import.meta.main) {
  const db = new Database(":memory:");
  const scheduler = new Scheduler(definition, { db }, {
    onFire: (id, name, result) => {
      console.log(`[${id}] fired: ${name}`);
      if (name === "generate" || name === "iterate") {
        console.log(`  context:`, JSON.stringify(result.context, null, 2));
      }
    },
    onComplete: (id) => console.log(`[${id}] ✓ completed`),
    onError: (id, err) => console.error(`[${id}] ✗ error:`, err),
  });

  await scheduler.createInstance("agent-001");

  for (let i = 0; i < 100; i++) {
    const fired = await scheduler.tick();
    if (fired === 0) break;
  }

  const state = await scheduler.inspect("agent-001");
  console.log("\nFinal state:", JSON.stringify(state, null, 2));
}
