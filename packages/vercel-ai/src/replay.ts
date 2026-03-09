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
  output: { type: string } | unknown;
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

const ERROR_OUTPUT_TYPES = new Set(["error-text", "error-json", "execution-denied"]);

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
          entries.push({
            toolName: part.toolName,
            input: callInputs.get(part.toolCallId),
            isError: isErrorResult(part),
          });
        }
      }
    }
  }

  return entries;
}
