import { createGateManager } from "@petriflow/gate";
import type { ComposeConfig, GateManagerOptions, ReplayEntry, SkillNet } from "@petriflow/gate";
import { wrapTools as wrapToolsInternal } from "./wrap-tools.js";
import type { GateContext } from "@petriflow/gate";
import { extractReplayEntries } from "./replay.js";

type GateOptions = Omit<GateManagerOptions, "mode"> & {
  mode?: GateManagerOptions["mode"];
  /** Called for manual transitions. If not provided, manual transitions are blocked. */
  confirm?: (title: string, message: string) => Promise<boolean>;
  /** Transform block reasons before they reach the model. Receives the default constraint message. */
  transformBlockReason?: (toolName: string, reason: string) => string;
  /**
   * Classify a tool result as an error. Applied in both live execution and
   * replay. During live execution, `result` is the raw return value from the
   * tool's `execute`. During replay, `result` is the `output` field from the
   * stored tool-result message part.
   *
   * When this returns `true`, the result is treated as a failure: deferred
   * transitions do not fire, and the net marking stays unchanged.
   *
   * Built-in detection for Vercel AI error output types (`error-text`,
   * `error-json`, `execution-denied`) always runs first. This callback is
   * only consulted when the built-in check passes.
   */
  isToolResultError: (toolName: string, result: unknown) => boolean;
};

type WrapToolsOptions = {
  /** Initialize gate state from existing conversation history. */
  messages?: { role: string; content: unknown }[];
};

export function createPetriflowGate(nets: SkillNet<string>[], opts: GateOptions): PetriflowGate;
export function createPetriflowGate(config: ComposeConfig, opts: GateOptions): PetriflowGate;
export function createPetriflowGate(
  input: SkillNet<string>[] | ComposeConfig,
  opts: GateOptions,
): PetriflowGate {
  const managerOpts: GateManagerOptions = {
    mode: opts.mode ?? "enforce",
    onDecision: opts.onDecision,
  };

  const ctx: GateContext = {
    hasUI: !!opts.confirm,
    confirm: opts.confirm ?? (async () => false),
  };

  return {
    wrapTools: <T extends Record<string, any>>(tools: T, wrapOpts?: WrapToolsOptions): GateSession<T> => {
      const manager = createGateManager(input, managerOpts);

      if (wrapOpts?.messages) {
        manager.replay(extractReplayEntries(
          wrapOpts.messages,
          { isToolResultError: opts.isToolResultError },
        ));
      }

      return {
        tools: wrapToolsInternal(tools, manager, ctx, opts.transformBlockReason, opts.isToolResultError),
        systemPrompt: () => manager.formatSystemPrompt(),
        formatStatus: () => manager.formatStatus(),
        addNet: (name: string) => manager.addNet(name),
        removeNet: (name: string) => manager.removeNet(name),
        manager,
      };
    },
  };
}

export type GateSession<T extends Record<string, any> = Record<string, any>> = {
  tools: T;
  systemPrompt: () => string;
  formatStatus: () => string;
  addNet: (name: string) => { ok: boolean; message: string };
  removeNet: (name: string) => { ok: boolean; message: string };
  manager: ReturnType<typeof createGateManager>;
};

export type PetriflowGate = {
  wrapTools: <T extends Record<string, any>>(tools: T, opts?: WrapToolsOptions) => GateSession<T>;
};

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions, ReplayEntry, RuleMetadata } from "@petriflow/gate";
export { defineSkillNet, createGateManager } from "@petriflow/gate";

// Re-export errors
export { ToolCallBlockedError } from "./errors.js";

// Re-export bundled net
export { vercelAiToolApprovalNet } from "./nets/tool-approval.js";
