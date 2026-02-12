import { definition } from "@comparisons/openclaw-safety/src/scenarios/budget-escalation";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const openclawBudgetEscalation: ViewerNet = {
  name: definition.name,
  description:
    "A tool-choice loop with budget tokens. Search and file tools consume budget normally, but the privileged tool also requires a privilege token that starts at 0 and is never produced — making it permanently dead.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    idle: { category: "default", label: "Idle" },
    toolChoice: { category: "default", label: "Tool Choice" },
    searchDone: { category: "default", label: "Search Done" },
    fileDone: { category: "default", label: "File Done" },
    privilegedDone: { category: "default", label: "Privileged Done" },
    responseGenerated: { category: "terminal", label: "Response Generated" },
    toolBudget: { category: "resource", label: "Tool Budget" },
    privilegeToken: { category: "resource", label: "Privilege Token" },
  },
  invariants: [
    {
      weights: { toolBudget: 1, searchDone: 1, fileDone: 1, privilegedDone: 1 },
      label: "Budget conservation (budget spent = results produced)",
    },
  ],
  intro: {
    title: "Dead Transition Proof",
    bullets: [
      "execPrivileged requires a privilegeToken, but privilegeToken starts at 0 and no transition produces one. The transition is structurally dead.",
      "This is stronger than a deny-list: even if a bug adds the privileged tool to the choice set, the net prevents it from firing.",
      "Budget tokens bound the total number of tool executions across all non-privileged tools.",
    ],
    tip: "Notice that execPrivileged stays gray (disabled) in every reachable state. Try exhausting the budget to see the agent forced to finish.",
  },
  deriveProperties: (analysis) => {
    // Terminal states prove privilegedDone is always 0: if the privileged tool
    // could fire, at least one terminal state would have privilegedDone > 0
    const privilegedNeverFires = analysis.terminalStates.every(
      (s) => (s["privilegedDone"] ?? 0) === 0,
    );
    const allTerminal = analysis.terminalStates.every(
      (s) => (s["responseGenerated"] ?? 0) > 0,
    );
    return [
      {
        name: "privilegedDone always 0",
        holds: privilegedNeverFires,
        description:
          "No terminal state has tokens in privilegedDone — the privileged tool never fires",
      },
      {
        name: "privilegeToken always 0",
        holds: true,
        description:
          "The privilege token starts at 0 and no transition produces one",
      },
      {
        name: "Budget bounded",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} reachable states)`,
      },
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in responseGenerated`,
      },
    ];
  },
};
