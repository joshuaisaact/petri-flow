/** Generic tool call event — framework-agnostic */
export type GateToolCall = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
};

/** Generic tool result event — framework-agnostic */
export type GateToolResult = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  isError: boolean;
};

/** Generic context for gating decisions */
export type GateContext = {
  hasUI: boolean;
  confirm: (title: string, message: string) => Promise<boolean>;
};

/** A gating decision: block with reason, or undefined to allow */
export type GateDecision = { block: true; reason: string } | undefined;
