import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "idle"
  | "toolChoice"
  | "searchDone"
  | "fileDone"
  | "privilegedDone"
  | "responseGenerated"
  | "toolBudget"
  | "privilegeToken";

type Ctx = Record<string, unknown>;

export const TOOL_BUDGET = 3;

export const definition = defineWorkflow<Place, Ctx>({
  name: "budget-escalation",
  places: [
    "idle",
    "toolChoice",
    "searchDone",
    "fileDone",
    "privilegedDone",
    "responseGenerated",
    "toolBudget",
    "privilegeToken",
  ],
  transitions: [
    // Start
    {
      name: "start",
      type: "automatic",
      inputs: ["idle"],
      outputs: ["toolChoice"],
      guard: null,
    },

    // Search tool — consumes budget, recirculates control
    {
      name: "execSearch",
      type: "http",
      inputs: ["toolChoice", "toolBudget"],
      outputs: ["toolChoice", "searchDone"],
      guard: null,
    },

    // File tool — consumes budget, recirculates control
    {
      name: "execFile",
      type: "http",
      inputs: ["toolChoice", "toolBudget"],
      outputs: ["toolChoice", "fileDone"],
      guard: null,
    },

    // Privileged tool — requires privilege token (starts at 0, never produced)
    {
      name: "execPrivileged",
      type: "script",
      inputs: ["toolChoice", "toolBudget", "privilegeToken"],
      outputs: ["toolChoice", "privilegedDone"],
      guard: null,
    },

    // Finish — when done choosing tools
    {
      name: "finish",
      type: "automatic",
      inputs: ["toolChoice"],
      outputs: ["responseGenerated"],
      guard: null,
    },
  ],
  initialMarking: {
    idle: 1,
    toolChoice: 0,
    searchDone: 0,
    fileDone: 0,
    privilegedDone: 0,
    responseGenerated: 0,
    toolBudget: TOOL_BUDGET,
    privilegeToken: 0,
  },
  initialContext: {},
  terminalPlaces: ["responseGenerated"],
});

export default definition;
