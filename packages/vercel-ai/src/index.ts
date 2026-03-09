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

// ---------------------------------------------------------------------------
// Session factory — compile once, createSession() per request
// ---------------------------------------------------------------------------

type FactoryInput =
  | { rules: string }
  | { nets: SkillNet<string>[] }
  | { config: ComposeConfig };

export type PetriflowFactory = {
  /** Create a fresh gate session (new markings, same compiled nets). */
  createSession: () => PetriflowGate;
  /** The compiled nets used by this factory. */
  nets: readonly SkillNet<string>[];
};

export async function createPetriflowFactory(
  input: string | FactoryInput,
  opts?: GateOptions,
): Promise<PetriflowFactory> {
  let nets: SkillNet<string>[];
  let createSession: () => PetriflowGate;

  if (typeof input === "string") {
    const { loadRules } = await import("@petriflow/rules");
    const compiled = await loadRules(input);
    nets = compiled.nets;
    createSession = () => createPetriflowGate(nets, opts);
  } else if ("rules" in input) {
    const { compile } = await import("@petriflow/rules");
    const compiled = compile(input.rules);
    nets = compiled.nets;
    createSession = () => createPetriflowGate(nets, opts);
  } else if ("nets" in input) {
    nets = input.nets;
    createSession = () => createPetriflowGate(nets, opts);
  } else {
    const config = input.config;
    nets = Object.values(config.registry);
    createSession = () => createPetriflowGate(config, opts);
  }

  return { createSession, nets };
}

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions } from "@petriflow/gate";
export { defineSkillNet, createGateManager } from "@petriflow/gate";

// Re-export errors
export { ToolCallBlockedError } from "./errors.js";

// Re-export bundled net
export { vercelAiToolApprovalNet } from "./nets/tool-approval.js";
