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
      guard: null,
    },

    // Fan-out to three tool tracks
    {
      name: "distribute",
      type: "automatic",
      inputs: ["taskReceived"],
      outputs: ["searchReady", "fileReadReady", "shellPending"],
      guard: null,
    },

    // === Search (no approval needed) ===
    {
      name: "execSearch",
      type: "http",
      inputs: ["searchReady", "budget"],
      outputs: ["searchDone"],
      guard: null,
    },

    // === File read (no approval needed) ===
    {
      name: "execFileRead",
      type: "http",
      inputs: ["fileReadReady", "budget"],
      outputs: ["fileReadDone"],
      guard: null,
    },

    // === Shell (requires approval gate) ===
    {
      name: "requestShellApproval",
      type: "automatic",
      inputs: ["shellPending"],
      outputs: ["shellAwaitingApproval"],
      guard: null,
    },
    {
      name: "approveShell",
      type: "manual",
      inputs: ["shellAwaitingApproval"],
      outputs: ["shellApproved"],
      guard: null,
    },
    {
      name: "rejectShell",
      type: "manual",
      inputs: ["shellAwaitingApproval"],
      outputs: ["shellDone"],
      guard: null,
    },
    {
      name: "execShell",
      type: "script",
      inputs: ["shellApproved", "budget"],
      outputs: ["shellDone"],
      guard: null,
    },

    // Skip shell entirely
    {
      name: "skipShell",
      type: "automatic",
      inputs: ["shellPending"],
      outputs: ["shellDone"],
      guard: null,
    },

    // AND-join: all three tracks must complete
    {
      name: "joinResults",
      type: "automatic",
      inputs: ["searchDone", "fileReadDone", "shellDone"],
      outputs: ["resultsReady"],
      guard: null,
    },

    // Generate response
    {
      name: "generateResponse",
      type: "ai",
      inputs: ["resultsReady"],
      outputs: ["responseGenerated"],
      guard: null,
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
