import { definition } from "@workflows/contract-approval/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const contractApproval: ViewerNet = {
  name: definition.name,
  description:
    "Finance and legal review concurrently after submission. The execute transition requires BOTH approvals — if either rejects, execution is structurally impossible. The token isn't there.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    submitted: { category: "default", label: "Submitted" },
    awaitingFinance: { category: "default", label: "Awaiting Finance" },
    awaitingLegal: { category: "default", label: "Awaiting Legal" },
    financeApproved: { category: "default", label: "Finance Approved" },
    financeRejected: { category: "terminal", label: "Finance Rejected" },
    legalApproved: { category: "default", label: "Legal Approved" },
    legalRejected: { category: "terminal", label: "Legal Rejected" },
    executed: { category: "terminal", label: "Executed" },
  },
  invariants: [
    {
      weights: { submitted: 1, awaitingFinance: 1, financeApproved: 1, financeRejected: 1, executed: 1 },
      label: "Finance track conservation (one token always in finance pipeline)",
    },
  ],
  deriveProperties: (analysis) => [
    {
      name: "Termination",
      holds: analysis.terminalStates.length === 4,
      description: `All contracts terminate (${analysis.terminalStates.length} outcomes: both approve, finance rejects, legal rejects, both reject)`,
    },
    {
      name: "No execution without both approvals",
      holds: analysis.terminalStates.every(
        (s) => s.executed === 0 || (s.financeRejected === 0 && s.legalRejected === 0),
      ),
      description: "No terminal state has executed with a rejection",
    },
    {
      name: "Concurrent review",
      holds: analysis.reachableStateCount > 4,
      description: "Finance and legal review independently — either can complete first",
    },
  ],
};
