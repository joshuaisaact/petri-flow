import { definition } from "@workflows/simple-agent/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const simpleAgent: ViewerNet = {
  name: definition.name,
  description:
    "A ReAct-style agent with one tool and an iteration budget. The agent plans, runs a tool, then either responds or loops back — consuming a budget token each time. When the budget is spent, the agent is forced to respond.",
  definition,
  net: toNet(definition.net),
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
