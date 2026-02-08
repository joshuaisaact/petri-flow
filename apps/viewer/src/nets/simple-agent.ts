import type { ViewerNet } from "../types";

const ITERATION_BUDGET = 2;

export const simpleAgent: ViewerNet = {
  name: "simple-agent",
  description:
    "A ReAct-style agent with one tool and an iteration budget. The agent plans, runs a tool, then either responds or loops back — consuming a budget token each time. When the budget is spent, the agent is forced to respond.",
  net: {
    transitions: [
      { name: "plan", inputs: ["userQuery"], outputs: ["planReady"] },
      {
        name: "dispatchTool",
        inputs: ["planReady"],
        outputs: ["toolPending"],
      },
      {
        name: "completeTool",
        inputs: ["toolPending"],
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
      toolPending: 0,
      resultsReady: 0,
      responseGenerated: 0,
      iterationBudget: ITERATION_BUDGET,
    },
  },
  placeMetadata: {
    userQuery: { category: "default", label: "User Query" },
    planReady: { category: "default", label: "Plan Ready" },
    toolPending: { category: "default", label: "Tool Running" },
    resultsReady: { category: "default", label: "Results Ready" },
    responseGenerated: { category: "terminal", label: "Response" },
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
        description: `All ${analysis.terminalStates.length} terminal states end in a response`,
      },
      {
        name: "Bounded iterations",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} states) — budget enforces the bound`,
      },
    ];
  },
};
