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
};

export function createPetriflowGate(nets: SkillNet<string>[], opts?: GateOptions): PetriflowGate;
export function createPetriflowGate(config: ComposeConfig, opts?: GateOptions): PetriflowGate;
export function createPetriflowGate(
  input: SkillNet<string>[] | ComposeConfig,
  opts?: GateOptions,
): PetriflowGate {
  const managerOpts: GateManagerOptions | undefined = opts
    ? { mode: opts.mode ?? "enforce", onDecision: opts.onDecision }
    : undefined;

  const ctx: GateContext = {
    hasUI: !!opts?.confirm,
    confirm: opts?.confirm ?? (async () => false),
  };

  return {
    wrapTools: <T extends Record<string, any>>(tools: T): GateSession<T> => {
      const manager = createGateManager(input, managerOpts);
      return {
        tools: wrapToolsInternal(tools, manager, ctx, opts?.transformBlockReason),
        systemPrompt: () => manager.formatSystemPrompt(),
        formatStatus: () => manager.formatStatus(),
        addNet: (name: string) => manager.addNet(name),
        removeNet: (name: string) => manager.removeNet(name),
        replay: (entries: ReplayEntry[] | string[]) => manager.replay(entries),
        replayFromMessages: (messages: { role: string; content: unknown }[]) => {
          manager.replay(extractReplayEntries(messages));
        },
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
  /** Replay tool results to advance net state. Accepts ReplayEntry[] or string[] of successful tool names. */
  replay: (entries: ReplayEntry[] | string[]) => void;
  /** Extract tool results from Vercel AI SDK message history and replay them. */
  replayFromMessages: (messages: { role: string; content: unknown }[]) => void;
  manager: ReturnType<typeof createGateManager>;
};

export type PetriflowGate = {
  wrapTools: <T extends Record<string, any>>(tools: T) => GateSession<T>;
};

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions, ReplayEntry, RuleMetadata } from "@petriflow/gate";
export { defineSkillNet, createGateManager } from "@petriflow/gate";

// Re-export errors
export { ToolCallBlockedError } from "./errors.js";

// Re-export bundled net
export { vercelAiToolApprovalNet } from "./nets/tool-approval.js";
