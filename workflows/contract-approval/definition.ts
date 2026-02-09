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
      inputs: ["submitted"],
      outputs: ["awaitingFinance", "awaitingLegal"],
    },
    {
      name: "approveFinance",
      inputs: ["awaitingFinance"],
      outputs: ["financeApproved"],
      execute: async (ctx) => ({ financeReviewer: "cfo" }),
    },
    {
      name: "rejectFinance",
      inputs: ["awaitingFinance"],
      outputs: ["financeRejected"],
      execute: async (ctx) => ({ financeReviewer: "cfo" }),
    },
    {
      name: "approveLegal",
      inputs: ["awaitingLegal"],
      outputs: ["legalApproved"],
      execute: async (ctx) => ({ legalReviewer: "counsel" }),
    },
    {
      name: "rejectLegal",
      inputs: ["awaitingLegal"],
      outputs: ["legalRejected"],
      execute: async (ctx) => ({ legalReviewer: "counsel" }),
    },
    {
      name: "execute",
      inputs: ["financeApproved", "legalApproved"],
      outputs: ["executed"],
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
