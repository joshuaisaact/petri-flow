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
 * - After success: `manager.handleToolResult({ isError })` where `isError`
 *   is determined by the optional `isToolResultError` callback
 * - After thrown error: `manager.handleToolResult({ isError: true })`, re-throws
 * - Tools without `execute` (schema-only) pass through unchanged
 *
 * Note: tool execution is not wrapped with a timeout. If `execute` hangs,
 * `handleToolResult` is never called and the net state will stall.
 */
type WrapToolsOpts = {
  transformBlockReason?: (toolName: string, reason: string) => string;
  isToolResultError: (toolName: string, result: unknown) => boolean;
};

export function wrapTools<T extends Record<string, Tool>>(
  tools: T,
  manager: GateManager,
  ctx: GateContext,
  opts: WrapToolsOpts,
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
          const reason = opts.transformBlockReason ? opts.transformBlockReason(name, decision.reason) : decision.reason;
          throw new ToolCallBlockedError(name, toolCallId, reason);
        }

        try {
          const result = await originalExecute(input, options);
          let isError = false;
          if (opts.isToolResultError) {
            try {
              isError = opts.isToolResultError(name, result);
            } catch {
              // Callback threw — treat as error to avoid advancing on unknown state
              isError = true;
            }
          }
          manager.handleToolResult({
            toolCallId,
            toolName: name,
            input: input ?? {},
            isError,
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
