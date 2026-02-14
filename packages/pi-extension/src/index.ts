import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { createGateManager, formatMarking } from "@petriflow/gate";
import type { ComposeConfig, SkillNet } from "@petriflow/gate";

export function createPetriGate<P extends string>(net: SkillNet<P>) {
  return composeGates([net as SkillNet<string>]);
}

export function composeGates(nets: SkillNet<string>[]): (pi: ExtensionAPI) => void;
export function composeGates(config: ComposeConfig): (pi: ExtensionAPI) => void;
export function composeGates(input: SkillNet<string>[] | ComposeConfig): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI) => {
    const manager = createGateManager(input);

    // Gate tool calls — 4-phase protocol (active nets only)
    pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
      const result = await manager.handleToolCall(
        { toolCallId: event.toolCallId, toolName: event.toolName, input: event.input as Record<string, unknown> },
        { hasUI: ctx.hasUI, confirm: ctx.hasUI ? (t, m) => ctx.ui.confirm(t, m) : async () => false },
      );
      const activeNets = manager.getActiveNets();
      const markings = activeNets.map((n) => `${n.name}=${formatMarking(n.state.marking)}`).join(" ");
      console.error(
        `[petri-compose] tool_call=${event.toolName} result=${result ? JSON.stringify(result) : "allow"} ${markings}`,
      );
      return result;
    });

    // Handle tool results — fan out to ALL nets (including removed with pending deferreds)
    pi.on("tool_result", (event: ToolResultEvent) => {
      const allNets = manager.getAllNets();
      const pendingNets = allNets.filter((n) => n.state.pending.has(event.toolCallId));
      manager.handleToolResult({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input as Record<string, unknown>,
        isError: event.isError,
      });
      for (const n of pendingNets) {
        console.error(
          `[petri-compose] tool_result=${event.toolName} net=${n.name} isError=${event.isError} marking=${formatMarking(n.state.marking)}`,
        );
      }
    });

    // /net-status command — show all markings with active/inactive status
    pi.registerCommand("net-status", {
      description: "Show current Petri net state for all composed nets",
      handler: async (_args, ctx) => {
        ctx.ui.notify(manager.formatStatus());
      },
    });

    // Dynamic commands (only for registry mode)
    if (manager.isDynamic) {
      pi.registerCommand("add-net", {
        description: "Activate a net from the registry",
        handler: async (args, ctx) => {
          const name = (args as string | undefined)?.trim();
          if (!name) {
            const allNets = manager.getAllNets();
            ctx.ui.notify(`Usage: /add-net <name>\nAvailable: ${allNets.map((n) => n.name).join(", ")}`);
            return;
          }
          const result = manager.addNet(name);
          ctx.ui.notify(result.message);
        },
      });

      pi.registerCommand("remove-net", {
        description: "Deactivate a net (state preserved for re-add)",
        handler: async (args, ctx) => {
          const name = (args as string | undefined)?.trim();
          if (!name) {
            const activeNets = manager.getActiveNets();
            ctx.ui.notify(`Usage: /remove-net <name>\nActive: ${activeNets.map((n) => n.name).join(", ")}`);
            return;
          }
          const result = manager.removeNet(name);
          ctx.ui.notify(result.message);
        },
      });
    }

    // Inject active nets' state into system prompt
    pi.on("before_agent_start", (event) => {
      return {
        systemPrompt: event.systemPrompt + "\n\n" + manager.formatSystemPrompt(),
      };
    });
  };
}

// Re-export everything from @petriflow/gate for backward compat
export * from "@petriflow/gate";
