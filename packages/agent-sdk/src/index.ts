import { createGateManager, findBlockingNet } from "@petriflow/gate";
import type {
  ComposeConfig,
  GateContext,
  GateDecision,
  GateManager,
  GateManagerOptions,
  SkillNet,
} from "@petriflow/gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Hook callback matching the Agent SDK's HookCallback signature. */
export type HookCallback = (
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  context: { signal: AbortSignal },
) => Promise<Record<string, unknown>>;

/** Matcher group matching the Agent SDK's hook registration shape. */
export type HookMatcher = {
  matcher?: string;
  hooks: HookCallback[];
};

type HooksConfig = Record<string, HookMatcher[]>;

type PetriflowAgentOptions = Omit<GateManagerOptions, "mode"> & {
  mode?: GateManagerOptions["mode"];
  /** Called for manual transitions. If not provided, manual transitions are blocked. */
  confirm?: (title: string, message: string) => Promise<boolean>;
};

export type PetriflowAgentGate = {
  /** Hook config to spread into the Agent SDK's `options.hooks`. */
  hooks: HooksConfig;
  /**
   * The underlying GateManager — inspect state, add/remove nets.
   *
   * Note: a single manager is created per `createPetriflowGate()` call.
   * For multi-conversation processes, create a new gate per conversation.
   */
  manager: GateManager;
  /** Formatted system prompt describing active constraints. */
  systemPrompt: () => string;
  /** Formatted current net state. */
  formatStatus: () => string;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPetriflowGate(nets: SkillNet<string>[], opts?: PetriflowAgentOptions): PetriflowAgentGate;
export function createPetriflowGate(config: ComposeConfig, opts?: PetriflowAgentOptions): PetriflowAgentGate;
export function createPetriflowGate(
  input: SkillNet<string>[] | ComposeConfig,
  opts?: PetriflowAgentOptions,
): PetriflowAgentGate {
  const managerOpts: GateManagerOptions = {
    mode: opts?.mode ?? "enforce",
    onDecision: opts?.onDecision,
  };

  const manager = createGateManager(input, managerOpts);

  const ctx: GateContext = {
    hasUI: !!opts?.confirm,
    confirm: opts?.confirm ?? (async () => false),
  };

  // PreToolUse callback — gate check before tool execution
  const preToolUse: HookCallback = async (input, toolUseId) => {
    const toolName = input["tool_name"];
    if (typeof toolName !== "string") return {};

    const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};

    const decision: GateDecision = await manager.handleToolCall(
      { toolCallId: toolUseId ?? "", toolName, input: toolInput },
      ctx,
    );

    if (decision?.block) {
      const netName = findBlockingNet(manager, toolName);
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `[${netName}] ${decision.reason}`,
        },
      };
    }

    return {};
  };

  // PostToolUse callback — fire deferred transitions on success
  const postToolUse: HookCallback = async (input, toolUseId) => {
    const toolName = input["tool_name"];
    if (typeof toolName !== "string") return {};

    const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};

    manager.handleToolResult({
      toolCallId: toolUseId ?? "",
      toolName,
      input: toolInput,
      isError: false,
    });

    return {};
  };

  // PostToolUseFailure callback — clear pending deferreds on error
  const postToolUseFailure: HookCallback = async (input, toolUseId) => {
    const toolName = input["tool_name"];
    if (typeof toolName !== "string") return {};

    const toolInput = (input["tool_input"] as Record<string, unknown>) ?? {};

    manager.handleToolResult({
      toolCallId: toolUseId ?? "",
      toolName,
      input: toolInput,
      isError: true,
    });

    return {};
  };

  return {
    hooks: {
      PreToolUse: [{ hooks: [preToolUse] }],
      PostToolUse: [{ hooks: [postToolUse] }],
      PostToolUseFailure: [{ hooks: [postToolUseFailure] }],
    },
    manager,
    systemPrompt: () => manager.formatSystemPrompt(),
    formatStatus: () => manager.formatStatus(),
  };
}

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions, GateDecision, GateContext, RuleMetadata } from "@petriflow/gate";
export { defineSkillNet, createGateManager, findBlockingNet } from "@petriflow/gate";

// Re-export bundled net
export { safeCodingNet } from "./nets/safe-coding.js";
