# Changelog

## 0.4.0 — @petriflow/vercel-ai

### Breaking: required `isToolResultError` for deferred transition error classification

`createPetriflowGate(nets, opts)` now requires `opts` with an `isToolResultError` callback. This fixes deferred transitions firing on failed tool results in both live execution and replay.

The AI SDK converts thrown errors to content parts, so most tool failures arrive as return values. Without this callback, PetriFlow had no way to distinguish `{success: false}` from `{success: true}` — both advanced the net.

```typescript
const gate = createPetriflowGate(nets, {
  isToolResultError: (toolName, result) =>
    typeof result === "object" && result !== null && (result as any).success === false,
});
```

- Applied in both live execution and replay
- SDK output wrappers stripped during replay so the callback always receives raw values
- Callback throwing is fail-closed (treated as error)
- Built-in detection for SDK error types (`error-text`, `error-json`, `execution-denied`) runs first during replay; the callback is only consulted when the built-in check does not already classify the result as an error

## 0.3.1 — @petriflow/gate, @petriflow/vercel-ai

### Replay: derive gate state from message history

The AI SDK is stateless — each `generateText`/`streamText` call takes the full message history. Gate state should be derived from that same history. `replayFromMessages` is the primary integration pattern for stateless request handlers.

- `@petriflow/gate`: `manager.replay(entries)` advances markings from completed tool results. Accepts `ReplayEntry[]` or `string[]` (successful tool names). Idempotent — skips transitions that can't fire.
- `@petriflow/vercel-ai`: `wrapTools` accepts `{ messages }` to initialize gate state from conversation history.

```typescript
const session = gate.wrapTools(myTools, { messages });
const result = await generateText({ tools: session.tools, messages });
```

## 0.3.0 — @petriflow/gate, @petriflow/rules, @petriflow/vercel-ai

### Breaking: constraint-stating block reasons

Block reasons now state the constraint plainly instead of exposing internal Petri net state. LLMs can interpret these and recover instead of giving up.

```text
# Before
Tool 'deploy' blocked: [require-test-before-deploy] Tool 'deploy' not available in current state. Marking: ready:1

# After
Tool 'deploy' blocked: deploy requires a successful call to test first.
```

- `@petriflow/gate`: `RuleMetadata` type on `SkillNet`, `formatBlockReason()` export
- `@petriflow/rules`: compiler emits `ruleMetadata` on every compiled net
- `@petriflow/vercel-ai`: optional `transformBlockReason` hook on `GateOptions` — an escape hatch for custom wording. Most users won't need it since gate 0.3.0 produces good messages by default
- Messages by rule type:
  - `require A before B` → "B requires a successful call to A first."
  - `block A` → "A is blocked and cannot be called."
  - `limit A to N per session` → "A has reached its limit of N calls per session."
  - `require human-approval before B` → "B requires human approval."
- Hand-built nets without metadata: "Tool 'X' is not available in the current state."

## 0.2.0 — @petriflow/vercel-ai

### Breaking: stateless gate, session-scoped state

`createPetriflowGate` is now stateless. `wrapTools()` returns a `GateSession` with fresh markings, deferred tracking, and rate-limit budgets. The gate is safe to share across requests.

```typescript
// Before (0.1.x)
const gate = createPetriflowGate(nets, opts);
const tools = gate.wrapTools(myTools);
generateText({ tools, system: gate.systemPrompt() });

// After (0.2.0)
const gate = createPetriflowGate(nets, opts);
const session = gate.wrapTools(myTools);
generateText({ tools: session.tools, system: session.systemPrompt() });
```

- `wrapTools()` returns `GateSession<T>` instead of `T`
- `systemPrompt()`, `formatStatus()`, `addNet()`, `removeNet()` moved from gate to session
- `createPetriflowFactory` removed (no longer needed)
- Tutorial 6: Server Integration added
- CHANGELOG.md added to package

## 0.1.0 — Initial Release

### @petriflow/engine

Core Petri net execution engine with formal verification.

- Workflow definitions with places, transitions, guards, and context
- Filtrex expression guards (compile-time validated)
- Deferred execution: transitions fire on successful tool result
- Timeout support for transitions with configurable delay and target place
- `WorkflowExecutor` interface with `createExecutor` factory
- `Scheduler` with automatic advancement, timeout handling, and `injectToken()` for external events
- Built-in node executors: HTTP (`httpNode`) and timer (`timerNode`)
- SQLite persistence adapter with definition store, transition history, and timeout entries
- `analyse()` for exhaustive reachable state enumeration, deadlock detection, and invariant checking

### @petriflow/gate

Tool-gating layer that sits between an agent and its tools.

- `SkillNet` type: Petri nets with tool-gated transitions, free tools, and toolMappers
- `handleToolCall` / `handleToolResult` for 4-phase gating protocol (classify → gate → allow/block → resolve)
- `autoAdvance` fires structural transitions automatically on state change
- `classifyNets` for multi-net composition: free, gated, blocked, or abstain verdicts
- `createGateManager` orchestrates multiple nets with shadow/enforce modes
- `GateManager.formatStatus()` and `formatSystemPrompt()` for observability
- Dynamic net management: `addNet()` / `removeNet()` with state preservation
- `onDecision` callback for logging and evaluation
- `defineSkillNet` type-safe helper

### @petriflow/rules

Declarative rules DSL and presets for tool gating. Three layers of control.

- **Presets** (Layer 1): `backupBeforeDelete()`, `observeBeforeSend()`, `testBeforeDeploy()`, `researchBeforeShare()`
- **Declarative DSL** (Layer 2):
  - `require A before B` — sequence enforcement with deferred transitions
  - `require human-approval before B` — manual gate per invocation
  - `block A` — provably dead transition
  - `limit A to N per session` — finite budget
  - `limit A to N per action` — refillable budget with spent/budget token conservation
- **Dot notation**: `discord.sendMessage` auto-generates toolMapper for action-dispatch tools
- **Map statements**: `map bash.command rm as delete` for pattern-based virtual tool names
  - Bare word patterns with automatic word-boundary matching
  - Regex escape hatch with `/pattern/` delimiters
- **Compile-time verification**: `compile()` runs `petri-ts` analysis on every net, returning reachable state counts
- All three layers produce `SkillNet` and compose via `createGateManager`

### @petriflow/claude-code

Claude Code hooks adapter.

- `configure(projectDir)` generates hooks config for `.claude/settings.json`
- Hook entry point handles `SessionStart`, `PreToolUse`, `PostToolUse` events
- Loads nets from `.claude/petriflow.config.ts` project config file
- Re-exports `defineSkillNet` and `createGateManager` for config files

### @petriflow/pi-extension

pi-coding-agent extension adapter.

- `composeGates(nets, opts)` returns a `(pi: ExtensionAPI) => void` setup function
- `createPetriGate(net, opts)` convenience wrapper for single-net use
- Gates `tool_call` events and resolves deferred transitions on `tool_result`
- System prompt injection with active net status
- `/net-status`, `/add-net`, `/remove-net` commands for dynamic management

### @petriflow/pi-assistant

Pre-built skill nets for common personal assistant patterns.

- `cleanupNet` — backup-before-destroy with bash command toolMapper and path coverage validation
- `communicateNet` — observe-before-send with action-dispatch toolMapper
- `deployNet` — test → build → stage → ship pipeline with manual production gate
- `researchNet` — fetch-before-share with 1:1 token ratio

### @petriflow/openclaw

OpenClaw plugin adapter.

- `createPetriGatePlugin(nets, opts)` returns an `OpenClawPluginDefinition`
- Synthetic `toolCallId` correlation for OpenClaw's hook protocol
- System prompt injection and `/net-status`, `/add-net`, `/remove-net` commands
- Bundled nets: `openclawToolApprovalNet`, `whatsappSafetyNet`

### @petriflow/cli

Command-line analysis tool.

- `petriflow analyse <workflow.ts>` — enumerate reachable states, detect deadlocks, check invariants
- `--dot` for Graphviz output, `--json` for machine-readable output
- `--strict` exits with error on deadlocks or invariant violations

### @petriflow/server

HTTP server for workflow management.

- Hono-based HTTP API with SSE streaming
- Workflow instance lifecycle: create, fire transitions, query state
- Definition CRUD with persistence
- Transition history and timeout management

### Site

Marketing site at `site/index.html`.

- Hero with declarative rules DSL example
- Problem/solution comparison (skill-only vs skill + PetriFlow)
- WhatsApp bot real-world example with execution trace
- Three-layer architecture showcase
- Safety rules gallery with guarantee badges
- Integration cards for Claude Code, pi-coding-agent, and OpenClaw
- Formal verification section with verify output example
