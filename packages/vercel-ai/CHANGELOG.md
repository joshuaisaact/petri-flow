# @petriflow/vercel-ai changelog

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
