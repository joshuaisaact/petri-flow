import type { GateToolCall, GateToolResult, GateContext, GateDecision } from "./events.js";
import type { SkillNet } from "./types.js";
import type { GateState } from "./gate.js";
import {
  createGateState,
  formatMarking,
  getEnabledToolTransitions,
  handleToolResult as handleToolResultSingle,
} from "./gate.js";
import { autoAdvance } from "./advance.js";
import { composedToolCall } from "./compose.js";
import type { ComposeConfig } from "./compose.js";

export type GateManager = {
  handleToolCall: (event: GateToolCall, ctx: GateContext) => Promise<GateDecision>;
  handleToolResult: (event: GateToolResult) => void;
  addNet: (name: string) => { ok: boolean; message: string };
  removeNet: (name: string) => { ok: boolean; message: string };
  getActiveNets: () => Array<{ name: string; net: SkillNet<string>; state: GateState<string> }>;
  getAllNets: () => Array<{ name: string; net: SkillNet<string>; state: GateState<string>; active: boolean }>;
  formatStatus: () => string;
  formatSystemPrompt: () => string;
  isDynamic: boolean;
};

export type GateManagerOptions = {
  /** "enforce" blocks disallowed tools. "shadow" logs but never blocks. */
  mode: "enforce" | "shadow";
  /** Called after every gating decision. Use for logging, metrics, debugging. */
  onDecision?: (event: GateToolCall, decision: GateDecision) => void;
};

export function createGateManager(input: SkillNet<string>[] | ComposeConfig, opts?: GateManagerOptions): GateManager {
  const manager = Array.isArray(input) ? createArrayManager(input) : createRegistryManager(input);

  if (opts) {
    const original = manager.handleToolCall;
    manager.handleToolCall = async (event, ctx) => {
      const decision = await original.call(manager, event, ctx);
      opts.onDecision?.(event, decision);
      if (opts.mode === "shadow" && decision?.block) {
        return undefined;
      }
      return decision;
    };
  }

  return manager;
}

function createArrayManager(nets: SkillNet<string>[]): GateManager {
  const states = nets.map((net) =>
    createGateState(autoAdvance(net, { ...net.initialMarking })),
  );

  const getNets = () => nets;
  const getStates = () => states;

  return {
    handleToolCall(event, ctx) {
      return composedToolCall(getNets, getStates, event, ctx);
    },

    handleToolResult(event) {
      for (let i = 0; i < nets.length; i++) {
        handleToolResultSingle(event, nets[i]!, states[i]!);
      }
    },

    addNet() {
      return { ok: false, message: "Static composition does not support dynamic nets" };
    },

    removeNet() {
      return { ok: false, message: "Static composition does not support dynamic nets" };
    },

    getActiveNets() {
      return nets.map((net, i) => ({ name: net.name, net, state: states[i]! }));
    },

    getAllNets() {
      return nets.map((net, i) => ({ name: net.name, net, state: states[i]!, active: true }));
    },

    formatStatus() {
      return nets
        .map((n, i) => `${n.name}: ${formatMarking(states[i]!.marking)}`)
        .join("\n");
    },

    formatSystemPrompt() {
      return formatPromptForNets(nets, states);
    },

    isDynamic: false,
  };
}

function createRegistryManager(config: ComposeConfig): GateManager {
  const registry = new Map<string, { net: SkillNet<string>; state: GateState<string> }>();
  for (const [name, net] of Object.entries(config.registry)) {
    registry.set(name, {
      net,
      state: createGateState(autoAdvance(net, { ...net.initialMarking })),
    });
  }

  const activeNames = new Set<string>(config.active ?? Object.keys(config.registry));

  const getActiveNets = () => [...activeNames].map((n) => registry.get(n)!.net);
  const getActiveStates = () => [...activeNames].map((n) => registry.get(n)!.state);

  return {
    handleToolCall(event, ctx) {
      return composedToolCall(getActiveNets, getActiveStates, event, ctx);
    },

    handleToolResult(event) {
      for (const { net, state } of registry.values()) {
        handleToolResultSingle(event, net, state);
      }
    },

    addNet(name) {
      if (!registry.has(name)) {
        return { ok: false, message: `Unknown net '${name}'. Available: ${[...registry.keys()].join(", ")}` };
      }
      if (activeNames.has(name)) {
        return { ok: false, message: `'${name}' is already active` };
      }
      activeNames.add(name);
      return { ok: true, message: `Activated '${name}'` };
    },

    removeNet(name) {
      if (!activeNames.has(name)) {
        return { ok: false, message: `'${name}' is not active. Active: ${[...activeNames].join(", ")}` };
      }
      activeNames.delete(name);
      return { ok: true, message: `Deactivated '${name}' (state preserved)` };
    },

    getActiveNets() {
      return [...activeNames].map((name) => {
        const entry = registry.get(name)!;
        return { name, net: entry.net, state: entry.state };
      });
    },

    getAllNets() {
      return [...registry.entries()].map(([name, { net, state }]) => ({
        name,
        net,
        state,
        active: activeNames.has(name),
      }));
    },

    formatStatus() {
      return [...registry.entries()]
        .map(([name, { state }]) => {
          const status = activeNames.has(name) ? "active" : "inactive";
          return `${name} (${status}): ${formatMarking(state.marking)}`;
        })
        .join("\n");
    },

    formatSystemPrompt() {
      return formatPromptForNets(getActiveNets(), getActiveStates());
    },

    isDynamic: true,
  };
}

function formatPromptForNets(nets: SkillNet<string>[], states: GateState<string>[]): string {
  const sections = nets.map((net, i) => {
    const enabled = getEnabledToolTransitions(net, states[i]!.marking);
    const toolList = enabled.flatMap((t) => t.tools ?? []);
    return `### ${net.name}\nAvailable gated tools: ${toolList.join(", ") || "none"}\nFree tools: ${net.freeTools.join(", ")}\nState: ${formatMarking(states[i]!.marking)}`;
  });
  return `## Active Petri Nets (composed)\n${sections.join("\n\n")}`;
}
