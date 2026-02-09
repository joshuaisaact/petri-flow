// Re-export everything from petri-ts
export {
  canFire,
  fire,
  reachableStates,
  terminalStates,
  isDeadlockFree,
  enabledTransitions,
  checkInvariant,
  toDot,
  createDispatcher,
  memoryAdapter,
} from "petri-ts";

export type {
  Marking,
  Transition,
  PetriNet,
  InstanceState,
  PersistenceAdapter,
} from "petri-ts";

// PetriFlow types
export type {
  WorkflowTransition,
  WorkflowNet,
  WorkflowStatus,
  WorkflowContext,
  WorkflowDefinition,
  ExecutionResult,
} from "./types.js";

// Workflow definition helpers
export { defineWorkflow, toNet } from "./workflow.js";

// Persistence
export { sqliteAdapter } from "./persistence/index.js";
export type { ExtendedInstanceState } from "./persistence/index.js";
export {
  CREATE_WORKFLOW_INSTANCES,
  CREATE_TIMEOUT_ENTRIES,
} from "./persistence/index.js";

// Engine
export {
  canFireWorkflow,
  enabledWorkflowTransitions,
  fireWorkflow,
} from "./engine.js";

// Decision
export type {
  DecisionRequest,
  DecisionResult,
  DecisionProvider,
} from "./decision.js";

// Executor
export { createExecutor } from "./executor.js";
export type { WorkflowExecutor, StepResult } from "./executor.js";

// Scheduler
export { Scheduler } from "./scheduler.js";
export type { SchedulerOptions, SchedulerEvents } from "./scheduler.js";

// Analysis (wraps petri-ts analyse with workflow name)
export { analyse } from "./analyse.js";
export type { WorkflowAnalysisResult, AnalyseOptions } from "./analyse.js";
