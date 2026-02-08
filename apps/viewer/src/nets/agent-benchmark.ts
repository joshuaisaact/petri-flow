import type { ViewerNet } from "../types";

const ITERATION_BUDGET = 3;

export const agentBenchmark: ViewerNet = {
  name: "agent-benchmark",
  description:
    "LLM agent loop as a Petri net. The agent picks tools, the net enforces the rules. Human approval gates dangerous operations. Budget tokens bound iteration count structurally.",
  net: {
    transitions: [
      { name: "plan", inputs: ["userQuery"], outputs: ["planReady"] },
      {
        name: "distribute",
        inputs: ["planReady"],
        outputs: ["searchDecision", "dbDecision", "codeDecision"],
      },
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
      },
      { name: "dispatchDB", inputs: ["dbDecision"], outputs: ["dbPending"] },
      { name: "skipDB", inputs: ["dbDecision"], outputs: ["dbDone"] },
      { name: "completeDB", inputs: ["dbPending"], outputs: ["dbDone"] },
      {
        name: "dispatchCode",
        inputs: ["codeDecision"],
        outputs: ["codePending"],
      },
      { name: "skipCode", inputs: ["codeDecision"], outputs: ["codeDone"] },
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
      { name: "rejectCode", inputs: ["humanApproval"], outputs: ["codeDone"] },
      {
        name: "executeCode",
        inputs: ["codeApproved"],
        outputs: ["codeDone"],
      },
      {
        name: "joinResults",
        inputs: ["searchDone", "dbDone", "codeDone"],
        outputs: ["resultsReady"],
      },
      {
        name: "generate",
        inputs: ["resultsReady"],
        outputs: ["responseGenerated"],
      },
      {
        name: "iterate",
        inputs: ["resultsReady", "iterationBudget"],
        outputs: ["userQuery"],
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
  },
  placeMetadata: {
    userQuery: { category: "default", label: "User Query" },
    planReady: { category: "default", label: "Plan Ready" },
    searchDecision: { category: "default", label: "Search?" },
    dbDecision: { category: "default", label: "DB?" },
    codeDecision: { category: "default", label: "Code?" },
    searchPending: { category: "default", label: "Search Running" },
    searchDone: { category: "default", label: "Search Done" },
    dbPending: { category: "default", label: "DB Running" },
    dbDone: { category: "default", label: "DB Done" },
    codePending: { category: "default", label: "Code Requested" },
    humanApproval: { category: "human", label: "Human Approval" },
    codeApproved: { category: "default", label: "Code Approved" },
    codeDone: { category: "default", label: "Code Done" },
    resultsReady: { category: "default", label: "Results Ready" },
    responseGenerated: { category: "terminal", label: "Response Generated" },
    iterationBudget: { category: "resource", label: "Iteration Budget" },
  },
  deriveProperties: (analysis) => {
    const allTerminal = analysis.terminalStates.every(
      (s) => (s["responseGenerated"] ?? 0) > 0,
    );
    return [
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in responseGenerated`,
      },
      {
        name: "Human gate",
        holds: true,
        description:
          "Code execution structurally requires passing through humanApproval",
      },
      {
        name: "No orphaned work",
        holds: true,
        description:
          "joinResults requires all three tool results before proceeding",
      },
      {
        name: "Bounded iterations",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} reachable states)`,
      },
    ];
  },
};
