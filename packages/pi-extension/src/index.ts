import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SkillNet } from "./types.js";
import { autoAdvance } from "./advance.js";
import {
  createGateState,
  formatMarking,
  getEnabledToolTransitions,
  handleToolCall,
  handleToolResult,
} from "./gate.js";

export function createPetriGate<Place extends string>(net: SkillNet<Place>) {
  return (pi: ExtensionAPI) => {
    const state = createGateState(autoAdvance(net, { ...net.initialMarking }));

    // Gate tool calls
    pi.on("tool_call", async (event, ctx) => {
      const result = await handleToolCall(event, ctx, net, state);
      console.error(
        `[petri-gate] tool_call=${event.toolName} result=${result ? JSON.stringify(result) : "allow"} marking=${formatMarking(state.marking)}`,
      );
      return result;
    });

    // Handle tool results (fires deferred transitions)
    pi.on("tool_result", (event) => {
      const hadPending = state.pending.has(event.toolCallId);
      handleToolResult(event, net, state);
      if (hadPending) {
        console.error(
          `[petri-gate] tool_result=${event.toolName} isError=${event.isError} marking=${formatMarking(state.marking)}`,
        );
      }
    });

    // /net-status command
    pi.registerCommand("net-status", {
      description: "Show current Petri net state",
      handler: async (_args, ctx) => {
        ctx.ui.notify(formatMarking(state.marking));
      },
    });

    // Inject net state into system prompt
    pi.on("before_agent_start", (event) => {
      const enabled = getEnabledToolTransitions(net, state.marking);
      const toolList = enabled.flatMap((t) => t.tools ?? []);
      return {
        systemPrompt:
          event.systemPrompt +
          `\n\n## Active Petri Net: ${net.name}\nAvailable gated tools: ${toolList.join(", ") || "none"}\nFree tools: ${net.freeTools.join(", ")}\nState: ${formatMarking(state.marking)}`,
      };
    });
  };
}

export { defineSkillNet } from "./types.js";
export type { SkillNet, GatedTransition, ToolEvent } from "./types.js";
export { autoAdvance } from "./advance.js";
export {
  handleToolCall,
  handleToolResult,
  formatMarking,
  getEnabledToolTransitions,
  createGateState,
} from "./gate.js";
export type { GateState } from "./gate.js";
