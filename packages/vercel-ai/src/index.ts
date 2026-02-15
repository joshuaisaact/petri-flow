import { createGateManager } from "@petriflow/gate";
import type { ComposeConfig, GateManagerOptions, SkillNet } from "@petriflow/gate";
import { wrapTools } from "./wrap-tools.js";
import type { GateContext } from "@petriflow/gate";

type GateOptions = Omit<GateManagerOptions, "mode"> & {
  mode?: GateManagerOptions["mode"];
  /** Called for manual transitions. If not provided, manual transitions are blocked. */
  confirm?: (title: string, message: string) => Promise<boolean>;
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

  const manager = createGateManager(input, managerOpts);

  const ctx: GateContext = {
    hasUI: !!opts?.confirm,
    confirm: opts?.confirm ?? (async () => false),
  };

  return {
    wrapTools: <T extends Record<string, any>>(tools: T): T =>
      wrapTools(tools, manager, ctx),
    systemPrompt: () => manager.formatSystemPrompt(),
    formatStatus: () => manager.formatStatus(),
    addNet: (name: string) => manager.addNet(name),
    removeNet: (name: string) => manager.removeNet(name),
    manager,
  };
}

export type PetriflowGate = {
  wrapTools: <T extends Record<string, any>>(tools: T) => T;
  systemPrompt: () => string;
  formatStatus: () => string;
  addNet: (name: string) => { ok: boolean; message: string };
  removeNet: (name: string) => { ok: boolean; message: string };
  manager: ReturnType<typeof createGateManager>;
};

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions } from "@petriflow/gate";
export { defineSkillNet, createGateManager } from "@petriflow/gate";

// Re-export errors
export { ToolCallBlockedError } from "./errors.js";

// Re-export bundled net
export { vercelAiToolApprovalNet } from "./nets/tool-approval.js";
