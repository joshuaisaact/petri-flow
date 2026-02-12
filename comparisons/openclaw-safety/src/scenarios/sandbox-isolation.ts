import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "agentIdle"
  | "sandboxReady"
  | "sandboxExecRunning"
  | "sandboxExecDone"
  | "elevationRequested"
  | "elevationApproved"
  | "hostExecRunning"
  | "hostExecDone"
  | "resultCollected"
  | "done"
  | "budget";

type Ctx = Record<string, unknown>;

export const SANDBOX_BUDGET = 3;

export const definition = defineWorkflow<Place, Ctx>({
  name: "sandbox-isolation",
  places: [
    "agentIdle",
    "sandboxReady",
    "sandboxExecRunning",
    "sandboxExecDone",
    "elevationRequested",
    "elevationApproved",
    "hostExecRunning",
    "hostExecDone",
    "resultCollected",
    "done",
    "budget",
  ],
  transitions: [
    // Enter sandbox
    {
      name: "enterSandbox",
      type: "automatic",
      inputs: ["agentIdle"],
      outputs: ["sandboxReady"],
      guard: null,
    },

    // Run command in sandbox (consumes budget)
    {
      name: "runSandbox",
      type: "script",
      inputs: ["sandboxReady", "budget"],
      outputs: ["sandboxExecRunning"],
      guard: null,
    },

    // Sandbox exec completes
    {
      name: "completeSandbox",
      type: "automatic",
      inputs: ["sandboxExecRunning"],
      outputs: ["sandboxExecDone"],
      guard: null,
    },

    // Request elevation to escape sandbox (consumes budget at request time)
    {
      name: "requestElevation",
      type: "automatic",
      inputs: ["sandboxReady", "budget"],
      outputs: ["elevationRequested"],
      guard: null,
    },

    // Approve elevation (manual — human must approve)
    {
      name: "approveElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["elevationApproved"],
      guard: null,
    },

    // Deny elevation (manual — returns to sandbox and refunds budget)
    {
      name: "denyElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["sandboxReady", "budget"],
      guard: null,
    },

    // Run on host (requires elevation approval; budget already consumed at request)
    {
      name: "runHost",
      type: "script",
      inputs: ["elevationApproved"],
      outputs: ["hostExecRunning"],
      guard: null,
    },

    // Host exec completes
    {
      name: "completeHost",
      type: "automatic",
      inputs: ["hostExecRunning"],
      outputs: ["hostExecDone"],
      guard: null,
    },

    // Collect results (from either sandbox or host)
    {
      name: "collectSandboxResult",
      type: "automatic",
      inputs: ["sandboxExecDone"],
      outputs: ["resultCollected"],
      guard: null,
    },
    {
      name: "collectHostResult",
      type: "automatic",
      inputs: ["hostExecDone"],
      outputs: ["resultCollected"],
      guard: null,
    },

    // Continue working (loop back to sandbox)
    {
      name: "continueWork",
      type: "automatic",
      inputs: ["resultCollected"],
      outputs: ["sandboxReady"],
      guard: null,
    },

    // Finish
    {
      name: "finish",
      type: "automatic",
      inputs: ["sandboxReady"],
      outputs: ["done"],
      guard: null,
    },
  ],
  initialMarking: {
    agentIdle: 1,
    sandboxReady: 0,
    sandboxExecRunning: 0,
    sandboxExecDone: 0,
    elevationRequested: 0,
    elevationApproved: 0,
    hostExecRunning: 0,
    hostExecDone: 0,
    resultCollected: 0,
    done: 0,
    budget: SANDBOX_BUDGET,
  },
  initialContext: {},
  terminalPlaces: ["done"],
});

// Locked sandbox variant: same net but approveElevation removed
export const lockedDefinition = defineWorkflow<Place, Ctx>({
  name: "sandbox-isolation-locked",
  places: [
    "agentIdle",
    "sandboxReady",
    "sandboxExecRunning",
    "sandboxExecDone",
    "elevationRequested",
    "elevationApproved",
    "hostExecRunning",
    "hostExecDone",
    "resultCollected",
    "done",
    "budget",
  ],
  transitions: [
    {
      name: "enterSandbox",
      type: "automatic",
      inputs: ["agentIdle"],
      outputs: ["sandboxReady"],
      guard: null,
    },
    {
      name: "runSandbox",
      type: "script",
      inputs: ["sandboxReady", "budget"],
      outputs: ["sandboxExecRunning"],
      guard: null,
    },
    {
      name: "completeSandbox",
      type: "automatic",
      inputs: ["sandboxExecRunning"],
      outputs: ["sandboxExecDone"],
      guard: null,
    },
    {
      name: "requestElevation",
      type: "automatic",
      inputs: ["sandboxReady", "budget"],
      outputs: ["elevationRequested"],
      guard: null,
    },
    // approveElevation REMOVED — elevation can never be granted
    {
      name: "denyElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["sandboxReady", "budget"],
      guard: null,
    },
    {
      name: "runHost",
      type: "script",
      inputs: ["elevationApproved"],
      outputs: ["hostExecRunning"],
      guard: null,
    },
    {
      name: "completeHost",
      type: "automatic",
      inputs: ["hostExecRunning"],
      outputs: ["hostExecDone"],
      guard: null,
    },
    {
      name: "collectSandboxResult",
      type: "automatic",
      inputs: ["sandboxExecDone"],
      outputs: ["resultCollected"],
      guard: null,
    },
    {
      name: "collectHostResult",
      type: "automatic",
      inputs: ["hostExecDone"],
      outputs: ["resultCollected"],
      guard: null,
    },
    {
      name: "continueWork",
      type: "automatic",
      inputs: ["resultCollected"],
      outputs: ["sandboxReady"],
      guard: null,
    },
    {
      name: "finish",
      type: "automatic",
      inputs: ["sandboxReady"],
      outputs: ["done"],
      guard: null,
    },
  ],
  initialMarking: {
    agentIdle: 1,
    sandboxReady: 0,
    sandboxExecRunning: 0,
    sandboxExecDone: 0,
    elevationRequested: 0,
    elevationApproved: 0,
    hostExecRunning: 0,
    hostExecDone: 0,
    resultCollected: 0,
    done: 0,
    budget: SANDBOX_BUDGET,
  },
  initialContext: {},
  terminalPlaces: ["done"],
});

export default definition;
