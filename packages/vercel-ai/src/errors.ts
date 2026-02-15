/** Thrown when a tool call is blocked by a Petri net gate. */
export class ToolCallBlockedError extends Error {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly reason: string;

  constructor(toolName: string, toolCallId: string, reason: string) {
    super(`Tool '${toolName}' blocked: ${reason}`);
    this.name = "ToolCallBlockedError";
    this.toolName = toolName;
    this.toolCallId = toolCallId;
    this.reason = reason;
  }
}
