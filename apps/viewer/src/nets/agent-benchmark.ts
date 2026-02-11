import { definition } from "@workflows/agent-benchmark/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const agentBenchmark: ViewerNet = {
  name: definition.name,
  description:
    "LLM agent loop. The planner decides which tools to use by setting useSearch/useDB/useCode in context — guards route tokens accordingly. Code execution requires human approval. Budget tokens bound the loop.",
  definition,
  net: toNet(definition.net),
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
