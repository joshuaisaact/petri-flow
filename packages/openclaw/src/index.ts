import { createGateManager } from "@petriflow/gate";
import type { ComposeConfig, GateManager, GateManagerOptions, SkillNet } from "@petriflow/gate";

// Import OpenClaw types (dev dependency — used for type checking only)
import type { OpenClawPluginDefinition, OpenClawPluginApi } from "openclaw/plugin-sdk";

export function createPetriGatePlugin(nets: SkillNet<string>[], opts?: GateManagerOptions): OpenClawPluginDefinition;
export function createPetriGatePlugin(config: ComposeConfig, opts?: GateManagerOptions): OpenClawPluginDefinition;
export function createPetriGatePlugin(input: SkillNet<string>[] | ComposeConfig, opts?: GateManagerOptions): OpenClawPluginDefinition {
  return {
    id: "petriflow-gate",
    name: "PetriFlow Gate",
    description: "Petri net gating for tool access control",
    register(api) {
      const manager = createGateManager(input, opts);
      wireHooks(api, manager);
      wireCommands(api, manager);
    },
  };
}

function wireHooks(api: OpenClawPluginApi, manager: GateManager): void {
  // --- Synthetic toolCallId correlation ---
  // OpenClaw hooks don't expose toolCallId, so we generate synthetic IDs
  // and correlate via FIFO queues per toolName.
  let nextId = 0;
  const pending = new Map<string, string[]>(); // toolName → [syntheticId, ...]

  // --- Gate tool calls via before_tool_call ---
  api.on("before_tool_call", async (event) => {
    const syntheticId = `gate-${++nextId}`;
    const decision = await manager.handleToolCall(
      { toolCallId: syntheticId, toolName: event.toolName, input: event.params },
      { hasUI: false, confirm: async () => false },
    );

    if (decision?.block) {
      api.logger.info(`[petri-gate] blocked ${event.toolName}: ${decision.reason}`);
      return { block: true, blockReason: decision.reason };
    }

    // Only track allowed calls — blocked tools don't need after_tool_call correlation
    const queue = pending.get(event.toolName) ?? [];
    queue.push(syntheticId);
    pending.set(event.toolName, queue);
    return undefined;
  });

  // --- Resolve deferred transitions via after_tool_call ---
  api.on("after_tool_call", async (event) => {
    const queue = pending.get(event.toolName);
    if (!queue?.length) return;

    const syntheticId = queue.shift()!;
    if (queue.length === 0) pending.delete(event.toolName);

    manager.handleToolResult({
      toolCallId: syntheticId,
      toolName: event.toolName,
      input: event.params,
      isError: !!event.error,
    });
  });

  // --- Inject net status into system prompt ---
  api.on("before_agent_start", () => {
    const prompt = manager.formatSystemPrompt();
    if (!prompt) return;
    return { prependContext: prompt };
  });
}

function wireCommands(api: OpenClawPluginApi, manager: GateManager): void {
  api.registerCommand({
    name: "net-status",
    description: "Show current Petri net state",
    handler: () => ({ text: manager.formatStatus() }),
  });

  if (manager.isDynamic) {
    api.registerCommand({
      name: "add-net",
      description: "Activate a net from the registry",
      acceptsArgs: true,
      handler: (ctx) => {
        const name = ctx.args?.trim();
        if (!name) {
          const all = manager.getAllNets();
          return { text: `Usage: /add-net <name>\nAvailable: ${all.map((n) => n.name).join(", ")}` };
        }
        const result = manager.addNet(name);
        return { text: result.message };
      },
    });

    api.registerCommand({
      name: "remove-net",
      description: "Deactivate a net (state preserved)",
      acceptsArgs: true,
      handler: (ctx) => {
        const name = ctx.args?.trim();
        if (!name) {
          const active = manager.getActiveNets();
          return { text: `Usage: /remove-net <name>\nActive: ${active.map((n) => n.name).join(", ")}` };
        }
        const result = manager.removeNet(name);
        return { text: result.message };
      },
    });
  }
}

// Re-export gate types for convenience
export type { SkillNet, ComposeConfig, GateManager, GateManagerOptions } from "@petriflow/gate";
export { defineSkillNet, createGateManager } from "@petriflow/gate";

// Re-export bundled nets
export { openclawToolApprovalNet } from "./nets/tool-approval.js";
