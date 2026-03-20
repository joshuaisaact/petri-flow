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
    },

    // Run command in sandbox (consumes budget)
    {
      name: "runSandbox",
      type: "script",
      inputs: ["sandboxReady", "budget"],
      outputs: ["sandboxExecRunning"],
    },

    // Sandbox exec completes
    {
      name: "completeSandbox",
      type: "automatic",
      inputs: ["sandboxExecRunning"],
      outputs: ["sandboxExecDone"],
    },

    // Request elevation to escape sandbox (consumes budget at request time)
    {
      name: "requestElevation",
      type: "automatic",
      inputs: ["sandboxReady", "budget"],
      outputs: ["elevationRequested"],
    },

    // Approve elevation (manual — human must approve)
    {
      name: "approveElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["elevationApproved"],
    },

    // Deny elevation (manual — returns to sandbox and refunds budget)
    {
      name: "denyElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["sandboxReady", "budget"],
    },

    // Run on host (requires elevation approval; budget already consumed at request)
    {
      name: "runHost",
      type: "script",
      inputs: ["elevationApproved"],
      outputs: ["hostExecRunning"],
    },

    // Host exec completes
    {
      name: "completeHost",
      type: "automatic",
      inputs: ["hostExecRunning"],
      outputs: ["hostExecDone"],
    },

    // Collect results (from either sandbox or host)
    {
      name: "collectSandboxResult",
      type: "automatic",
      inputs: ["sandboxExecDone"],
      outputs: ["resultCollected"],
    },
    {
      name: "collectHostResult",
      type: "automatic",
      inputs: ["hostExecDone"],
      outputs: ["resultCollected"],
    },

    // Continue working (loop back to sandbox)
    {
      name: "continueWork",
      type: "automatic",
      inputs: ["resultCollected"],
      outputs: ["sandboxReady"],
    },

    // Finish
    {
      name: "finish",
      type: "automatic",
      inputs: ["sandboxReady"],
      outputs: ["done"],
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
    },
    {
      name: "runSandbox",
      type: "script",
      inputs: ["sandboxReady", "budget"],
      outputs: ["sandboxExecRunning"],
    },
    {
      name: "completeSandbox",
      type: "automatic",
      inputs: ["sandboxExecRunning"],
      outputs: ["sandboxExecDone"],
    },
    {
      name: "requestElevation",
      type: "automatic",
      inputs: ["sandboxReady", "budget"],
      outputs: ["elevationRequested"],
    },
    // approveElevation REMOVED — elevation can never be granted
    {
      name: "denyElevation",
      type: "manual",
      inputs: ["elevationRequested"],
      outputs: ["sandboxReady", "budget"],
    },
    {
      name: "runHost",
      type: "script",
      inputs: ["elevationApproved"],
      outputs: ["hostExecRunning"],
    },
    {
      name: "completeHost",
      type: "automatic",
      inputs: ["hostExecRunning"],
      outputs: ["hostExecDone"],
    },
    {
      name: "collectSandboxResult",
      type: "automatic",
      inputs: ["sandboxExecDone"],
      outputs: ["resultCollected"],
    },
    {
      name: "collectHostResult",
      type: "automatic",
      inputs: ["hostExecDone"],
      outputs: ["resultCollected"],
    },
    {
      name: "continueWork",
      type: "automatic",
      inputs: ["resultCollected"],
      outputs: ["sandboxReady"],
    },
    {
      name: "finish",
      type: "automatic",
      inputs: ["sandboxReady"],
      outputs: ["done"],
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
