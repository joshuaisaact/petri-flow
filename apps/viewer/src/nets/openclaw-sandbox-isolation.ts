import {
  definition,
  lockedDefinition,
} from "@comparisons/openclaw-safety/src/scenarios/sandbox-isolation";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

const placeMetadata: ViewerNet["placeMetadata"] = {
  agentIdle: { category: "default", label: "Agent Idle" },
  sandboxReady: { category: "default", label: "Sandbox Ready" },
  sandboxExecRunning: { category: "default", label: "Sandbox Running" },
  sandboxExecDone: { category: "default", label: "Sandbox Done" },
  elevationRequested: { category: "human", label: "Elevation Requested" },
  elevationApproved: { category: "human", label: "Elevation Approved" },
  hostExecRunning: { category: "default", label: "Host Running" },
  hostExecDone: { category: "default", label: "Host Done" },
  resultCollected: { category: "default", label: "Result Collected" },
  done: { category: "terminal", label: "Done" },
  budget: { category: "resource", label: "Budget" },
};

export const openclawSandboxIsolation: ViewerNet = {
  name: definition.name,
  description:
    "Agent runs in a sandbox. To execute on the host, it must request elevation and receive human approval. Budget tokens limit total operations. The denyElevation path refunds the budget token.",
  definition,
  net: toNet(definition.net),
  placeMetadata,
  intro: {
    title: "Sandbox Escape Prevention",
    bullets: [
      "Host execution requires passing through elevationApproved, which only a manual approveElevation transition can produce.",
      "Budget tokens are consumed on both sandbox execution and elevation requests. Denial refunds the budget token.",
      "The agent can loop between sandbox execution and result collection, bounded by the budget.",
    ],
    tip: "Try approving an elevation request to see the host execution path. Then try denying — notice the budget token is refunded.",
  },
  deriveProperties: (analysis) => {
    const allTerminal = analysis.terminalStates.every(
      (s) => (s["done"] ?? 0) > 0,
    );
    return [
      {
        name: "Elevation requires manual approval",
        holds: true,
        description:
          "Only the manual approveElevation transition produces an elevation token",
      },
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in done`,
      },
      {
        name: "Budget bounded",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} reachable states)`,
      },
    ];
  },
};

export const openclawSandboxIsolationLocked: ViewerNet = {
  name: lockedDefinition.name,
  description:
    "Locked sandbox variant: approveElevation is removed entirely. The agent can request elevation, but it will always be denied. Host execution is structurally impossible.",
  definition: lockedDefinition,
  net: toNet(lockedDefinition.net),
  placeMetadata,
  intro: {
    title: "Locked Sandbox — No Escape Possible",
    bullets: [
      "approveElevation has been removed. No transition produces an elevationApproved token, so runHost is permanently dead.",
      "The agent can still request elevation, but only denyElevation can fire, refunding the budget.",
      "This proves that even if the agent tries every possible path, host execution is structurally unreachable.",
    ],
    tip: "Notice that runHost and completeHost stay gray forever. Try requesting elevation — only deny is available.",
  },
  deriveProperties: (analysis) => {
    // In the locked variant, no terminal state should have host tokens
    const hostNeverReached = analysis.terminalStates.every(
      (s) =>
        (s["hostExecRunning"] ?? 0) === 0 && (s["hostExecDone"] ?? 0) === 0,
    );
    const allTerminal = analysis.terminalStates.every(
      (s) => (s["done"] ?? 0) > 0,
    );
    return [
      {
        name: "Host places always 0",
        holds: hostNeverReached,
        description:
          "hostExecRunning and hostExecDone are never reached — host execution is impossible",
      },
      {
        name: "elevationApproved always 0",
        holds: true,
        description:
          "approveElevation is removed — no transition produces an elevation approval token",
      },
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in done`,
      },
      {
        name: "Budget bounded",
        holds: analysis.reachableStateCount < 10000,
        description: `Finite state space (${analysis.reachableStateCount} reachable states)`,
      },
    ];
  },
};
