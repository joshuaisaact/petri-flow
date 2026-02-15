# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PetriFlow is a Petri net-based safety layer for AI agents. It uses Petri nets (not DAGs) as the core primitive, enabling formal verification of concurrent constraints, resource contention, and multi-step safety policies before an agent runs.

## Commands

```bash
bun test                          # all tests (via turbo)
bun test packages/gate            # single package tests
bun test packages/rules/src/__tests__/compiler.test.ts  # single file
bun build                         # build all packages (via turbo)
bun check                         # typecheck all packages
bun dev                           # run server + viewer
```

Turbo handles dependency ordering: `test` and `check` depend on `^build` (dependencies build first).

## Package Dependency Graph

```
petri-ts (external, v0.1.5)
  └─ @petriflow/engine
       ├─ @petriflow/gate
       │    ├─ @petriflow/rules          (DSL compiler)
       │    ├─ @petriflow/vercel-ai      (Vercel AI SDK adapter)
       │    ├─ @petriflow/pi-extension   (pi-mono adapter)
       │    ├─ @petriflow/claude-code    (Claude Code hook)
       │    └─ @petriflow/openclaw       (OpenClaw adapter)
       ├─ @petriflow/server              (Hono HTTP API + SSE)
       ├─ @petriflow/cli                 (analysis CLI)
       └─ @petriflow/viewer             (React + xyflow visualizer)
```

## Architecture

**Engine** (`packages/engine`) — Extends petri-ts with guards, executors, timeouts, persistence (bun:sqlite), and scheduling. `WorkflowTransition = Transition & {guard, execute, timeout, ...}` — intersection type ensures structural compatibility with all petri-ts functions. `toNet()` strips extensions for pure analysis.

**Gate** (`packages/gate`) — Framework-agnostic tool access control. A `SkillNet` defines which tools are available via `tools[]` on transitions. Key concepts:
- **Deferred transitions**: tool call allowed immediately, net fires only on successful `tool_result`
- **Multi-net composition**: all nets must agree (AND logic) for a tool call to proceed
- **Tool mapping**: `toolMapper(event)` splits one tool (e.g. "bash") into virtual tools based on input fields
- `GateManager` orchestrates multiple nets with fan-out/fan-in

**Rules** (`packages/rules`) — Compiles a `.rules` DSL into verified SkillNets. Four rule types: `require A before B`, `require human-approval before B`, `block A`, `limit A to N per scope`. Also supports `map tool.field pattern as name` for tool discrimination. Each rule becomes an independent, small net — composition via AND logic at the manager level.

**Vercel AI** (`packages/vercel-ai`) — `createPetriflowGate(nets)` returns `{ wrapTools, systemPrompt, formatStatus }`. `wrapTools()` intercepts each tool's `execute` method with gate checks. Blocked tools throw `ToolCallBlockedError`.

## Key Types

- `Marking<Place>` = `Record<Place, number>` (from petri-ts)
- `Transition<Place>` = `{name, inputs[], outputs[]}` (from petri-ts)
- `WorkflowTransition<Place, Ctx>` = `Transition & {guard?, execute?, timeout?, config?}`
- `SkillNet<Place>` = Petri net + `freeTools[]`, `terminalPlaces[]`, optional `toolMapper`
- `GatedTransition<Place>` = Transition + `type` ("auto"|"manual"), `tools[]`, optional `deferred`
- `CompiledRules` = `{nets: SkillNet<string>[], verification: NetVerification[]}`

## Other Directories

- `workflows/` — Six example workflows (coffee, github-lookup, contract-approval, order-checkout, simple-agent, agent-benchmark)
- `examples/` — Three runnable Vercel AI SDK agent examples with `.rules` files
- `comparisons/` — Same scenarios in n8n and OpenClaw for comparison
- `site/` — Astro 5 documentation site
- `apps/viewer/` — React interactive net viewer (Vite + Tailwind v4 + xyflow)

## Runtime

Bun everywhere: test runner, package manager, runtime. TypeScript compiled with `tsc` (strict, ES2022, `noUncheckedIndexedAccess`). SQLite via `bun:sqlite` (not better-sqlite3 — native bindings have symbol issues with Bun).
