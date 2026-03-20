import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "idle"
  | "taskReceived"
  | "searchReady"
  | "searchDone"
  | "fileReadReady"
  | "fileReadDone"
  | "shellPending"
  | "shellAwaitingApproval"
  | "shellApproved"
  | "shellDone"
  | "resultsReady"
  | "responseGenerated"
  | "budget";

type Ctx = Record<string, unknown>;

export const definition = defineWorkflow<Place, Ctx>({
  name: "tool-approval",
  places: [
    "idle",
    "taskReceived",
    "searchReady",
    "searchDone",
    "fileReadReady",
    "fileReadDone",
    "shellPending",
    "shellAwaitingApproval",
    "shellApproved",
    "shellDone",
    "resultsReady",
    "responseGenerated",
    "budget",
  ],
  transitions: [
    // Receive task
    {
      name: "receiveTask",
      type: "automatic",
      inputs: ["idle"],
      outputs: ["taskReceived"],
    },

    // Fan-out to three tool tracks
    {
      name: "distribute",
      type: "automatic",
      inputs: ["taskReceived"],
      outputs: ["searchReady", "fileReadReady", "shellPending"],
    },

    // === Search (no approval needed) ===
    {
      name: "execSearch",
      type: "http",
      inputs: ["searchReady", "budget"],
      outputs: ["searchDone"],
    },

    // === File read (no approval needed) ===
    {
      name: "execFileRead",
      type: "http",
      inputs: ["fileReadReady", "budget"],
      outputs: ["fileReadDone"],
    },

    // === Shell (requires approval gate) ===
    {
      name: "requestShellApproval",
      type: "automatic",
      inputs: ["shellPending"],
      outputs: ["shellAwaitingApproval"],
    },
    {
      name: "approveShell",
      type: "manual",
      inputs: ["shellAwaitingApproval"],
      outputs: ["shellApproved"],
    },
    {
      name: "rejectShell",
      type: "manual",
      inputs: ["shellAwaitingApproval"],
      outputs: ["shellDone"],
    },
    {
      name: "execShell",
      type: "script",
      inputs: ["shellApproved", "budget"],
      outputs: ["shellDone"],
    },

    // Skip shell entirely
    {
      name: "skipShell",
      type: "automatic",
      inputs: ["shellPending"],
      outputs: ["shellDone"],
    },

    // AND-join: all three tracks must complete
    {
      name: "joinResults",
      type: "automatic",
      inputs: ["searchDone", "fileReadDone", "shellDone"],
      outputs: ["resultsReady"],
    },

    // Generate response
    {
      name: "generateResponse",
      type: "ai",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
    },
  ],
  initialMarking: {
    idle: 1,
    taskReceived: 0,
    searchReady: 0,
    searchDone: 0,
    fileReadReady: 0,
    fileReadDone: 0,
    shellPending: 0,
    shellAwaitingApproval: 0,
    shellApproved: 0,
    shellDone: 0,
    resultsReady: 0,
    responseGenerated: 0,
    budget: 3,
  },
  initialContext: {},
  terminalPlaces: ["responseGenerated"],
});

export default definition;
