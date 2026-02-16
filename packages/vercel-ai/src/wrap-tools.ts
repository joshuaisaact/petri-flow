import type { GateManager } from "@petriflow/gate";
import type { GateContext } from "@petriflow/gate";
import { ToolCallBlockedError } from "./errors.js";

/** Minimal tool shape from the Vercel AI SDK */
type Tool = {
  execute?: (input: any, options: { toolCallId: string; [key: string]: any }) => Promise<any>;
  [key: string]: any;
};

/**
 * Wraps each tool's `execute` with Petri net gating.
 *
 * - Before execute: `manager.handleToolCall()` — blocks if disallowed
 * - After success: `manager.handleToolResult({ isError: false })`
 * - After error: `manager.handleToolResult({ isError: true })`, re-throws
 * - Tools without `execute` (schema-only) pass through unchanged
 *
 * Note: tool execution is not wrapped with a timeout. If `execute` hangs,
 * `handleToolResult` is never called and the net state will stall.
 */
export function wrapTools<T extends Record<string, Tool>>(
  tools: T,
  manager: GateManager,
  ctx: GateContext,
): T {
  const wrapped = {} as Record<string, Tool>;

  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.execute) {
      wrapped[name] = tool;
      continue;
    }

    const originalExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (input: any, options: { toolCallId: string; [key: string]: any }) => {
        const toolCallId = options.toolCallId;
        if (!toolCallId) {
          throw new Error(`wrapTools: missing toolCallId for tool "${name}"`);
        }

        const decision = await manager.handleToolCall(
          { toolCallId, toolName: name, input: input ?? {} },
          ctx,
        );

        if (decision?.block) {
          throw new ToolCallBlockedError(name, toolCallId, decision.reason);
        }

        try {
          const result = await originalExecute(input, options);
          manager.handleToolResult({
            toolCallId,
            toolName: name,
            input: input ?? {},
            isError: false,
          });
          return result;
        } catch (error) {
          manager.handleToolResult({
            toolCallId,
            toolName: name,
            input: input ?? {},
            isError: true,
          });
          throw error;
        }
      },
    };
  }

  return wrapped as T;
}
