import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "submitted"
  | "awaitingFinance"
  | "awaitingLegal"
  | "financeApproved"
  | "financeRejected"
  | "legalApproved"
  | "legalRejected"
  | "executed";

type Ctx = {
  contractId: string;
  submittedBy: string;
  financeReviewer: string;
  legalReviewer: string;
};

export const definition = defineWorkflow<Place, Ctx>({
  name: "contract-approval",
  places: [
    "submitted",
    "awaitingFinance",
    "awaitingLegal",
    "financeApproved",
    "financeRejected",
    "legalApproved",
    "legalRejected",
    "executed",
  ],
  transitions: [
    {
      name: "submit",
      type: "automatic",
      inputs: ["submitted"],
      outputs: ["awaitingFinance", "awaitingLegal"],
      guard: null,
    },
    {
      name: "approveFinance",
      type: "manual",
      inputs: ["awaitingFinance"],
      outputs: ["financeApproved"],
      guard: null,
      config: { label: "Approve" },
      execute: async (ctx) => ({ financeReviewer: "cfo" }),
    },
    {
      name: "rejectFinance",
      type: "manual",
      inputs: ["awaitingFinance"],
      outputs: ["financeRejected"],
      guard: null,
      config: { label: "Reject" },
      execute: async (ctx) => ({ financeReviewer: "cfo" }),
    },
    {
      name: "approveLegal",
      type: "manual",
      inputs: ["awaitingLegal"],
      outputs: ["legalApproved"],
      guard: null,
      config: { label: "Approve" },
      execute: async (ctx) => ({ legalReviewer: "counsel" }),
    },
    {
      name: "rejectLegal",
      type: "manual",
      inputs: ["awaitingLegal"],
      outputs: ["legalRejected"],
      guard: null,
      config: { label: "Reject" },
      execute: async (ctx) => ({ legalReviewer: "counsel" }),
    },
    {
      name: "execute",
      type: "automatic",
      inputs: ["financeApproved", "legalApproved"],
      outputs: ["executed"],
      guard: null,
    },
  ],
  initialMarking: {
    submitted: 1,
    awaitingFinance: 0,
    awaitingLegal: 0,
    financeApproved: 0,
    financeRejected: 0,
    legalApproved: 0,
    legalRejected: 0,
    executed: 0,
  },
  initialContext: {
    contractId: "contract-001",
    submittedBy: "",
    financeReviewer: "",
    legalReviewer: "",
  },
  terminalPlaces: ["executed", "financeRejected", "legalRejected"],
  invariants: [
    {
      // Finance track: submitted fans out but only one finance-track
      // token exists at any time. submitted + awaitingFinance +
      // financeApproved + financeRejected + executed = 1
      weights: { submitted: 1, awaitingFinance: 1, financeApproved: 1, financeRejected: 1, executed: 1 },
    },
  ],
});

export default definition;
