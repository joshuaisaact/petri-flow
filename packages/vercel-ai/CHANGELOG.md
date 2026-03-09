# @petriflow/vercel-ai changelog

## 0.4.0

**Breaking change: required `isToolResultError` on `GateOptions`**

Tools that signal errors via return values (e.g. `{success: false}`) instead of throwing were silently advancing deferred transitions in both live execution and replay. Since the Vercel AI SDK catches thrown errors and converts them to content parts, error-as-value is the common case — not an edge case.

`isToolResultError` is now a required field on `GateOptions`. It's called in both the live `wrapTools` execution path and during replay, so you define error classification once at gate creation.

### Migration

```typescript
// Before (0.3.x)
const gate = createPetriflowGate(nets);

// After (0.4.0) — you must define what failure looks like
const gate = createPetriflowGate(nets, {
  isToolResultError: (toolName, result) =>
    typeof result === "object" && result !== null && (result as any).success === false,
});
```

### What changed

- `GateOptions` is now required (was optional)
- `isToolResultError: (toolName: string, result: unknown) => boolean` is required on `GateOptions`
- Live execution: after `execute()` returns, the callback determines `isError` for `handleToolResult`
- Replay: SDK output wrappers (`{ type: "json", value: ... }`) are stripped before calling the callback, so it always receives the raw tool return value
- Built-in detection for SDK error types (`error-text`, `error-json`, `execution-denied`) runs first during replay; the callback is only consulted when the built-in check does not already classify the result as an error
- If the callback throws, the result is treated as an error (fail-closed)

### Why

The AI SDK converts thrown errors to `tool-error` content parts — the throw never reaches PetriFlow's catch block. This means most tool failures arrive as return values, not exceptions. Without `isToolResultError`, deferred transitions fire on failed results, inflating token counts and unlocking downstream transitions that shouldn't be available.

## 0.3.1

- Replay: `wrapTools` accepts `{ messages }` to initialize gate state from conversation history
- `extractReplayEntries` correlates tool-call and tool-result parts by `toolCallId`

## 0.3.0

- Constraint-stating block reasons
- `transformBlockReason` hook on `GateOptions`
- Re-export `RuleMetadata` type

## 0.2.0

**Breaking change: stateless gate, session-scoped state**

`createPetriflowGate` is now stateless. All mutable state (markings, deferred tracking, rate-limit budgets) moves into the `GateSession` returned by `wrapTools()`. Each `wrapTools()` call creates fresh, independent state.

This makes the gate safe to share across requests in a server — no risk of accidentally sharing markings between users.

### Migration

```typescript
// Before (0.1.x)
const gate = createPetriflowGate(nets, opts);
const tools = gate.wrapTools(myTools);
generateText({
  tools,
  system: gate.systemPrompt(),
});

// After (0.2.0)
const gate = createPetriflowGate(nets, opts);
const session = gate.wrapTools(myTools);
generateText({
  tools: session.tools,
  system: session.systemPrompt(),
});
```

### What changed

- `wrapTools()` now returns `GateSession<T>` instead of `T`
  - `session.tools` — the wrapped tools (same type as before)
  - `session.systemPrompt()` — moved from `gate.systemPrompt()`
  - `session.formatStatus()` — moved from `gate.formatStatus()`
  - `session.addNet()` / `session.removeNet()` — moved from `gate.addNet()` / `gate.removeNet()`
- `PetriflowGate` now only has `wrapTools()` — all other methods moved to `GateSession`
- `createPetriflowFactory` removed — no longer needed since the gate itself is stateless

### Why

In 0.1.x, `createPetriflowGate` created a stateful object. Nothing in the API signaled this. In a server, sharing a gate across requests silently broke rate limits and sequencing. Users had to understand internal state management to get the lifecycle right.

Now the gate is inert configuration. `wrapTools()` is the session boundary. The correct pattern is obvious: one `wrapTools()` call per request.

## 0.1.3

- Bump `@petriflow/gate` to `^0.1.3`

## 0.1.2

- Add dual CJS/ESM builds via tsup

## 0.1.1

- Initial release
