# @petriflow/gate

## 0.3.2

### Bug Fixes

- **autoAdvance infinite loop**: Track seen markings across iterations to detect and terminate on structural self-loops and cycles. Previously, a net with a structural transition like `inputs: ["a"], outputs: ["a"]` (or a cycle of structural transitions) would hang indefinitely.
- **TOCTOU race in handleToolCall**: Re-check `canFire` after `await ctx.confirm()` in both single-net and composed paths. Prevents concurrent callers from double-spending tokens when manual approval yields control.
- **Meta rollback off-by-one**: The rejecting validator's own meta mutations are now included in the rollback (`j <= i` instead of `j < i`).
- **Non-atomic composed commit**: Pre-validate `canFire` for all gated verdicts before committing any. If any transition became disabled during an await, the entire call is blocked rather than partially committed.
- **Registry config.active validation**: Unknown net names in `config.active` are silently filtered instead of causing a runtime crash.
- **Replay toolCallId collisions**: Include entry index in generated toolCallIds to prevent collisions when replaying multiple deferred entries.

## 0.3.1

### Features

- `onDeferredResult` callback on `SkillNet` for recording metadata on deferred transition success.
- `validateToolCall` hook for domain-specific validation before gated tool calls.
- `ruleMetadata` on `SkillNet` for structured block reason formatting.
- Meta snapshot and rollback in composed validation phase.

## 0.3.0

### Features

- `GateManager` orchestrator with array and registry modes.
- Dynamic net add/remove in registry mode with state preservation.
- Shadow mode and `onDecision` callback for observability.
- `replay()` API for stateless gate initialization from message history.
- `formatBlockReason` for constraint-stating block messages from rule metadata.
