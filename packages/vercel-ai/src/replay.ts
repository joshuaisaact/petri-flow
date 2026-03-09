import type { ReplayEntry } from "@petriflow/gate";

/** Shape of a tool-call part in an assistant message */
type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
};

/** Shape of a tool-result part in a tool message */
type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
};

function isToolCallPart(part: unknown): part is ToolCallPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as any).type === "tool-call" &&
    typeof (part as any).toolCallId === "string" &&
    typeof (part as any).toolName === "string"
  );
}

function isToolResultPart(part: unknown): part is ToolResultPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as any).type === "tool-result" &&
    typeof (part as any).toolCallId === "string" &&
    typeof (part as any).toolName === "string"
  );
}

/**
 * SDK error output types that indicate a tool execution failure.
 * Tracks ToolResultOutput from @ai-sdk/provider-utils — update if the SDK
 * adds new error variants.
 */
const ERROR_OUTPUT_TYPES = new Set(["error-text", "error-json", "execution-denied"]);

/**
 * SDK wrapper types that carry a `.value` with the raw tool result.
 * Tracks ToolResultOutput from @ai-sdk/provider-utils — update if the SDK
 * adds new output variants with a `.value` field.
 */
const VALUE_OUTPUT_TYPES = new Set(["text", "json", "error-text", "error-json"]);

function isErrorResult(part: ToolResultPart): boolean {
  if (
    typeof part.output === "object" &&
    part.output !== null &&
    "type" in part.output &&
    typeof (part.output as { type: unknown }).type === "string"
  ) {
    return ERROR_OUTPUT_TYPES.has((part.output as { type: string }).type);
  }
  return false;
}

/**
 * Unwrap SDK output wrappers so isToolResultError receives the raw tool
 * return value, matching what it sees during live execution.
 *
 * SDK wraps results as: { type: "text"|"json", value: <raw> }
 * If the output isn't a known wrapper, return it as-is (handles
 * pre-SDK or hand-constructed messages).
 */
function unwrapOutput(output: unknown): unknown {
  if (
    typeof output === "object" &&
    output !== null &&
    "type" in output &&
    "value" in output &&
    typeof (output as { type: unknown }).type === "string" &&
    VALUE_OUTPUT_TYPES.has((output as { type: string }).type)
  ) {
    return (output as { value: unknown }).value;
  }
  return output;
}

export type ExtractReplayOptions = {
  /**
   * Custom predicate to classify a tool result as an error.
   * Called after the built-in check for Vercel AI error output types.
   * Receives the tool name and the unwrapped raw tool result (SDK output
   * wrappers like `{ type: "json", value: ... }` are stripped automatically).
   */
  isToolResultError?: (toolName: string, result: unknown) => boolean;
};

/**
 * Extract replay entries from Vercel AI SDK message history.
 *
 * Correlates tool-call parts (from assistant messages) with tool-result parts
 * (from tool messages) by toolCallId. The input from the call is preserved
 * for toolMapper resolution.
 *
 * Results are returned in the order tool-result parts appear in the messages.
 *
 * **Security:** The message history is treated as authoritative. Use
 * server-persisted messages, not client-provided history.
 */
export function extractReplayEntries(
  messages: { role: string; content: unknown }[],
  opts?: ExtractReplayOptions,
): ReplayEntry[] {
  // Index tool-call inputs by toolCallId
  const callInputs = new Map<string, Record<string, unknown>>();
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (isToolCallPart(part)) {
          callInputs.set(
            part.toolCallId,
            typeof part.input === "object" && part.input !== null
              ? (part.input as Record<string, unknown>)
              : {},
          );
        }
      }
    }
  }

  // Collect tool-result parts in order
  const entries: ReplayEntry[] = [];
  for (const msg of messages) {
    if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (isToolResultPart(part)) {
          const builtinError = isErrorResult(part);
          let customError = false;
          if (!builtinError && opts?.isToolResultError) {
            try {
              customError = opts.isToolResultError(part.toolName, unwrapOutput(part.output));
            } catch {
              // Callback threw — treat as error to avoid advancing on unknown state
              customError = true;
            }
          }
          entries.push({
            toolName: part.toolName,
            input: callInputs.get(part.toolCallId),
            isError: builtinError || customError,
          });
        }
      }
    }
  }

  return entries;
}
