import { canFire, fire } from "@petriflow/engine";
import type { Marking } from "@petriflow/engine";
import type { GateToolCall, GateToolResult, GateContext, GateDecision } from "./events.js";
import type { GatedTransition, SkillNet } from "./types.js";
import { autoAdvance } from "./advance.js";

/** Resolve the virtual tool name for a tool call event */
export function resolveTool<P extends string>(
  net: SkillNet<P>,
  event: { toolName: string; input: Record<string, unknown> },
): string {
  if (net.toolMapper) {
    return net.toolMapper({
      toolName: event.toolName,
      input: event.input,
    });
  }
  return event.toolName;
}

/** Return transitions that are structurally enabled and have a tools list */
function enabledToolTransitions<P extends string>(
  net: SkillNet<P>,
  marking: Marking<P>,
): GatedTransition<P>[] {
  return net.transitions.filter(
    (t) => t.tools !== undefined && t.tools.length > 0 && canFire(marking, t),
  );
}

/** Public: get tool transitions the agent can currently use */
export function getEnabledToolTransitions<P extends string>(
  net: SkillNet<P>,
  marking: Marking<P>,
): GatedTransition<P>[] {
  return enabledToolTransitions(net, marking);
}

/** Format marking for display */
export function formatMarking<P extends string>(marking: Marking<P>): string {
  return Object.entries(marking)
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

/** A pending deferred transition awaiting tool_result */
type PendingDeferred<P extends string> = {
  toolCallId: string;
  transition: GatedTransition<P>;
  resolvedTool: string;
};

export type GateState<P extends string> = {
  marking: Marking<P>;
  /** Skill-specific metadata (e.g. backed-up paths) */
  meta: Record<string, unknown>;
  /** Deferred transitions waiting for tool_result */
  pending: Map<string, PendingDeferred<P>>;
};

export function createGateState<P extends string>(marking: Marking<P>): GateState<P> {
  return { marking, meta: {}, pending: new Map() };
}

/**
 * Core gating logic for a tool_call event.
 * Mutates state.marking when a non-deferred transition fires.
 * For deferred transitions, records pending and fires on tool_result.
 */
export async function handleToolCall<P extends string>(
  event: GateToolCall,
  ctx: GateContext,
  net: SkillNet<P>,
  state: GateState<P>,
): Promise<GateDecision> {
  const resolvedTool = resolveTool(net, event);

  // Free tools always pass
  if (net.freeTools.includes(resolvedTool)) {
    return undefined;
  }

  const enabled = enabledToolTransitions(net, state.marking);
  const matching = enabled.filter((t) => t.tools!.includes(resolvedTool));

  if (matching.length === 0) {
    return {
      block: true,
      reason: `Tool '${resolvedTool}' not available in current state. Marking: ${formatMarking(state.marking)}`,
    };
  }

  const transition = matching[0]!;

  // Skill-specific validation (e.g. path coverage)
  if (net.validateToolCall) {
    const rejection = net.validateToolCall(
      { toolName: event.toolName, input: event.input },
      resolvedTool,
      transition,
      state,
    );
    if (rejection) return rejection;
  }

  if (transition.type === "manual") {
    if (!ctx.hasUI) {
      return { block: true, reason: `Manual transition '${transition.name}' requires UI approval` };
    }
    const approved = await ctx.confirm(
      `Approve: ${transition.name}`,
      `Allow '${resolvedTool}' via transition '${transition.name}'?`,
    );
    if (!approved) {
      return { block: true, reason: `Human rejected '${transition.name}'` };
    }
  }

  if (transition.deferred) {
    // Allow the tool call but don't fire yet — wait for tool_result
    state.pending.set(event.toolCallId, { toolCallId: event.toolCallId, transition, resolvedTool });
    return undefined;
  }

  // Fire immediately
  state.marking = fire(state.marking, transition);
  state.marking = autoAdvance(net, state.marking);

  return undefined;
}

/**
 * Handle a tool_result event. Fires deferred transitions on success.
 * Returns void (tool_result handler doesn't block).
 */
export function handleToolResult<P extends string>(
  event: GateToolResult,
  net: SkillNet<P>,
  state: GateState<P>,
): void {
  const pending = state.pending.get(event.toolCallId);
  if (!pending) return;

  state.pending.delete(event.toolCallId);

  if (event.isError) {
    // Tool failed — don't fire the transition, marking unchanged
    return;
  }

  // Tool succeeded — fire the deferred transition
  if (canFire(state.marking, pending.transition)) {
    state.marking = fire(state.marking, pending.transition);

    // Notify the skill of the successful deferred result
    if (net.onDeferredResult) {
      net.onDeferredResult(
        {
          toolCallId: event.toolCallId,
          input: event.input,
          isError: event.isError,
        },
        pending.resolvedTool,
        pending.transition,
        state,
      );
    }

    state.marking = autoAdvance(net, state.marking);
  }
}
