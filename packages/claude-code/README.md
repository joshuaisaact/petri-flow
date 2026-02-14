# @petriflow/claude-code

Claude Code adapter for Petri net tool gating. Hooks into Claude Code's tool pipeline via [hooks](https://code.claude.com/docs/en/hooks) to enforce safety constraints defined as skill nets.

Built on [`@petriflow/gate`](../gate).

## How it works

Claude Code hooks spawn a **new process per event** — there's no persistent connection. This adapter handles that by persisting gate state to a JSON file between invocations:

1. **SessionStart** — clear stale state
2. **PreToolUse** — restore state → gate the tool call → persist state → output allow/deny
3. **PostToolUse / PostToolUseFailure** — restore state → resolve deferred transitions → persist state

State files live at `/tmp/petriflow-claude-code-{session_id}.json`.

## Quick start

Install the package:

```bash
bun add @petriflow/claude-code
```

Add hooks to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bun run node_modules/@petriflow/claude-code/src/hook.ts" }] }],
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "bun run node_modules/@petriflow/claude-code/src/hook.ts" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "bun run node_modules/@petriflow/claude-code/src/hook.ts" }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "bun run node_modules/@petriflow/claude-code/src/hook.ts" }] }]
  }
}
```

Or generate the config programmatically:

```ts
import { configure } from "@petriflow/claude-code";
const config = configure("/path/to/project");
// Merge config.hooks into your .claude/settings.json
```

## Default net: `safe-coding`

The built-in net for Claude Code tool names:

| Category | Tools | Behavior |
|---|---|---|
| **Free** (always allowed) | `Read`, `Glob`, `Grep`, `WebSearch` | Read-only, no side effects |
| **Gated** (allowed when ready) | `Write`, `Edit`, `WebFetch`, `Task` | File mutations, HTTP, subagents |
| **Blocked** (never fires) | `Bash` | Arbitrary shell access |

## Custom config

Create `.claude/petriflow.config.ts` in your project root to override the default:

```ts
import { safeCodingNet } from "@petriflow/claude-code";

export default { nets: [safeCodingNet], mode: "enforce" as const };
```

### Modes

- **`enforce`** — blocks disallowed tool calls (deny decision sent to Claude Code)
- **`shadow`** — logs decisions to stderr but never blocks (useful for evaluation)

### Custom nets

```ts
import { defineSkillNet } from "@petriflow/claude-code";

const permissiveNet = defineSkillNet({
  name: "permissive",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["Read", "Glob", "Grep", "WebSearch", "Bash"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "writeFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Write"] },
    { name: "editFile", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Edit"] },
    { name: "webFetch", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["WebFetch"] },
    { name: "spawnTask", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["Task"] },
  ],
});

export default { nets: [permissiveNet], mode: "enforce" as const };
```

## API

| Export | Description |
|---|---|
| `safeCodingNet` | Default safety net for Claude Code |
| `configure(projectDir)` | Generate `.claude/settings.json` hooks config |
| `defineSkillNet(config)` | Re-export from `@petriflow/gate` |
| `createGateManager(input)` | Re-export from `@petriflow/gate` |

## Tests

```bash
bun test packages/claude-code
```
