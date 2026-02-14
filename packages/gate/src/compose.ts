import { fire } from "@petriflow/engine";
import type { GateToolCall, GateContext, GateDecision } from "./events.js";
import type { SkillNet } from "./types.js";
import { autoAdvance } from "./advance.js";
import {
  formatMarking,
  getEnabledToolTransitions,
  resolveTool,
} from "./gate.js";
import type { GateState } from "./gate.js";

/** Classification of a net's opinion on a tool call */
export type NetVerdict<P extends string> = {
  net: SkillNet<P>;
  state: GateState<P>;
  resolvedTool: string;
} & (
  | { kind: "free" }
  | { kind: "abstain" }
  | { kind: "blocked"; reason: string }
  | { kind: "gated"; transition: SkillNet<P>["transitions"][number] }
);

/** Registry-based config for dynamic net management */
export type ComposeConfig = {
  registry: Record<string, SkillNet<string>>;
  active?: string[];
};

/**
 * Check if a net has jurisdiction over a tool — i.e. the tool appears
 * in at least one transition's tools list (enabled or not).
 */
function hasJurisdiction<P extends string>(
  net: SkillNet<P>,
  resolvedTool: string,
): boolean {
  return net.transitions.some(
    (t) => t.tools !== undefined && t.tools.includes(resolvedTool),
  );
}

/**
 * Phase 1 — Structural check (non-mutating).
 * Classify each net as free, gated, blocked, or abstain.
 */
export function classifyNets<P extends string>(
  nets: SkillNet<P>[],
  states: GateState<P>[],
  event: { toolName: string; input: Record<string, unknown> },
): NetVerdict<P>[] {
  return nets.map((net, i) => {
    const state = states[i]!;
    const resolvedTool = resolveTool(net, event);
    const base = { net, state, resolvedTool };

    // Free tools always pass
    if (net.freeTools.includes(resolvedTool)) {
      return { ...base, kind: "free" as const };
    }

    // No jurisdiction → abstain
    if (!hasJurisdiction(net, resolvedTool)) {
      return { ...base, kind: "abstain" as const };
    }

    // Has jurisdiction — check enabled transitions
    const enabled = getEnabledToolTransitions(net, state.marking);
    const matching = enabled.filter((t) => t.tools!.includes(resolvedTool));

    if (matching.length === 0) {
      return {
        ...base,
        kind: "blocked" as const,
        reason: `[${net.name}] Tool '${resolvedTool}' not available in current state. Marking: ${formatMarking(state.marking)}`,
      };
    }

    return { ...base, kind: "gated" as const, transition: matching[0]! };
  });
}

/**
 * 4-phase tool call handler for composed nets.
 */
export async function composedToolCall(
  getNets: () => SkillNet<string>[],
  getStates: () => GateState<string>[],
  event: GateToolCall,
  ctx: GateContext,
): Promise<GateDecision> {
  const nets = getNets();
  const states = getStates();

  // --- Phase 1: Structural check ---
  const verdicts = classifyNets(nets, states, {
    toolName: event.toolName,
    input: event.input,
  });

  // If any net blocks, reject immediately
  const blocked = verdicts.find((v) => v.kind === "blocked");
  if (blocked) {
    return { block: true, reason: blocked.reason };
  }

  const gated = verdicts.filter(
    (v): v is Extract<NetVerdict<string>, { kind: "gated" }> => v.kind === "gated",
  );

  // No gated nets → all free/abstain → allow
  if (gated.length === 0) {
    return undefined;
  }

  // --- Phase 2: Manual approvals ---
  for (const v of gated) {
    if (v.transition.type === "manual") {
      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `[${v.net.name}] Manual transition '${v.transition.name}' requires UI approval`,
        };
      }
      const approved = await ctx.confirm(
        `Approve: ${v.transition.name} (${v.net.name})`,
        `Allow '${v.resolvedTool}' via transition '${v.transition.name}' in net '${v.net.name}'?`,
      );
      if (!approved) {
        return {
          block: true,
          reason: `[${v.net.name}] Human rejected '${v.transition.name}'`,
        };
      }
    }
  }

  // --- Phase 3: Semantic validation with meta rollback ---
  // Snapshot all meta for rollback
  const metaSnapshots = gated.map((v) => structuredClone(v.state.meta));

  for (let i = 0; i < gated.length; i++) {
    const v = gated[i]!;
    if (v.net.validateToolCall) {
      const rejection = v.net.validateToolCall(
        { toolName: event.toolName, input: event.input },
        v.resolvedTool,
        v.transition,
        v.state,
      );
      if (rejection) {
        // Rollback all meta that may have been mutated by earlier validates
        for (let j = 0; j < i; j++) {
          gated[j]!.state.meta = metaSnapshots[j]!;
        }
        return rejection;
      }
    }
  }

  // --- Phase 4: Commit ---
  for (const v of gated) {
    if (v.transition.deferred) {
      v.state.pending.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        transition: v.transition,
        resolvedTool: v.resolvedTool,
      });
    } else {
      v.state.marking = fire(v.state.marking, v.transition);
      v.state.marking = autoAdvance(v.net, v.state.marking);
    }
  }

  return undefined;
}
