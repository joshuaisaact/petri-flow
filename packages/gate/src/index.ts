// Types
export { defineSkillNet } from "./types.js";
export type { SkillNet, GatedTransition, ToolEvent } from "./types.js";

// Generic event types
export type { GateToolCall, GateToolResult, GateContext, GateDecision } from "./events.js";

// Auto-advance
export { autoAdvance } from "./advance.js";

// Single-net gating
export {
  handleToolCall,
  handleToolResult,
  formatMarking,
  getEnabledToolTransitions,
  createGateState,
  resolveTool,
} from "./gate.js";
export type { GateState } from "./gate.js";

// Multi-net composition
export { classifyNets, composedToolCall } from "./compose.js";
export type { ComposeConfig, NetVerdict } from "./compose.js";

// Manager
export { createGateManager } from "./manager.js";
export type { GateManager } from "./manager.js";
