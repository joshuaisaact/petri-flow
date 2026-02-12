import { definition } from "@comparisons/openclaw-safety/src/scenarios/tool-approval";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const openclawToolApproval: ViewerNet = {
  name: definition.name,
  description:
    "Three tool tracks fan out in parallel. Search and file-read fire freely; shell execution requires passing through a human approval gate. All three tracks must complete before the response is generated.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    idle: { category: "default", label: "Idle" },
    taskReceived: { category: "default", label: "Task Received" },
    searchReady: { category: "default", label: "Search Ready" },
    searchDone: { category: "default", label: "Search Done" },
    fileReadReady: { category: "default", label: "File Read Ready" },
    fileReadDone: { category: "default", label: "File Read Done" },
    shellPending: { category: "default", label: "Shell Pending" },
    shellAwaitingApproval: { category: "human", label: "Shell Awaiting Approval" },
    shellApproved: { category: "human", label: "Shell Approved" },
    shellDone: { category: "default", label: "Shell Done" },
    resultsReady: { category: "default", label: "Results Ready" },
    responseGenerated: { category: "terminal", label: "Response Generated" },
    budget: { category: "resource", label: "Budget" },
  },
  invariants: [
    {
      weights: {
        idle: 1,
        taskReceived: 1,
        searchReady: 1,
        searchDone: 1,
        fileReadReady: 1,
        fileReadDone: 1,
        resultsReady: 1,
        responseGenerated: 1,
      },
      label: "Flow conservation (main path)",
    },
  ],
  intro: {
    title: "Structural Approval Gate",
    bullets: [
      "The shell track has a structural approval gate: the token must pass through shellAwaitingApproval before reaching shellApproved. No runtime if-check can be bypassed.",
      "Search and file-read tracks are independent and fire freely with only a budget constraint.",
      "joinResults is an AND-join requiring all three tracks, so no partial results reach the response.",
    ],
    tip: "Try approving the shell vs rejecting it — both paths reach the same terminal state via the AND-join.",
  },
  deriveProperties: (analysis) => {
    const allTerminal = analysis.terminalStates.every(
      (s) => (s["responseGenerated"] ?? 0) > 0,
    );
    return [
      {
        name: "Shell approval gate",
        holds: true,
        description:
          "Shell execution is structurally impossible without passing through human approval",
      },
      {
        name: "Search/FileRead independence",
        holds: true,
        description:
          "Search and file-read fire independently without requiring approval",
      },
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in responseGenerated`,
      },
      {
        name: "Budget bounded",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} reachable states)`,
      },
    ];
  },
};
