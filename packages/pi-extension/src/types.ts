import type { Marking } from "@petriflow/engine";

/** A transition that optionally gates pi-mono tool access */
export type GatedTransition<Place extends string> = {
  name: string;
  type: "auto" | "manual";
  inputs: Place[];
  outputs: Place[];
  guard?: string | null;
  tools?: string[];
  /**
   * When true, the transition allows the tool call immediately but
   * only fires (consumes/produces tokens) when the tool_result
   * comes back successfully (isError === false).
   * Use this for transitions where the tool must succeed before
   * the net advances (e.g. backup must succeed before delete unlocks).
   */
  deferred?: boolean;
};

/** Minimal tool event shape for toolMapper */
export type ToolEvent = { toolName: string; input: Record<string, unknown> };

/** A Petri net that gates a skill's tool access */
export type SkillNet<Place extends string> = {
  name: string;
  places: Place[];
  transitions: GatedTransition<Place>[];
  initialMarking: Marking<Place>;
  terminalPlaces: Place[];
  freeTools: string[];
  /**
   * Maps a tool call to a virtual tool name before gating.
   * Use this to split one tool (e.g. "bash") into multiple gated
   * variants (e.g. "bash", "git-commit", "git-push") based on input.
   * If not provided, event.toolName is used as-is.
   */
  toolMapper?: (event: ToolEvent) => string;
  /**
   * Additional validation before a gated tool call is allowed.
   * Called after the net confirms a matching transition exists.
   * Return { block, reason } to reject, or void to allow.
   * Use this for domain-specific checks (e.g. path coverage).
   */
  validateToolCall?: (
    event: ToolEvent,
    resolvedTool: string,
    transition: GatedTransition<Place>,
    state: { marking: Marking<Place>; meta: Record<string, unknown> },
  ) => { block: true; reason: string } | void;
  /**
   * Called when a deferred transition's tool_result arrives.
   * Use this to record metadata (e.g. backed-up paths).
   */
  onDeferredResult?: (
    event: { toolCallId: string; input: Record<string, unknown>; isError: boolean },
    resolvedTool: string,
    transition: GatedTransition<Place>,
    state: { marking: Marking<Place>; meta: Record<string, unknown> },
  ) => void;
};

/** Type-safe helper — validates places/marking at the type level */
export function defineSkillNet<Place extends string>(
  net: SkillNet<Place>,
): SkillNet<Place> {
  return net;
}
