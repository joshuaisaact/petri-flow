# @petriflow/rules

Declarative rules DSL and presets for PetriFlow tool gating. Three layers of control, from zero-config to full power.

## Layer 1: Presets (zero config)

Drop-in safety nets for common patterns:

```typescript
import { backupBeforeDelete, createGateManager } from "@petriflow/rules";

const manager = createGateManager([backupBeforeDelete()], { mode: "enforce" });
```

Available presets:

| Preset | Description |
|---|---|
| `backupBeforeDelete()` | Require a backup before destructive operations |
| `observeBeforeSend()` | Read messages before sending |
| `testBeforeDeploy()` | Run tests before deploying |
| `researchBeforeShare()` | Fetch sources before sharing |

## Layer 2: Declarative DSL

Write rules as plain strings. The compiler turns each rule into a SkillNet.

```typescript
import { compile, createGateManager } from "@petriflow/rules";

const { nets, verification } = compile(`
  require backup before delete
  require human-approval before deploy
  block rm
  limit push to 3 per session
  limit push to 1 per test    # refill budget after each test
`);

// Every net is verified at compile time
console.log(verification);
// [
//   { name: "require-backup-before-delete", reachableStates: 3 },
//   { name: "approve-before-deploy",        reachableStates: 2 },
//   { name: "block-rm",                     reachableStates: 2 },
//   { name: "limit-push-3",                 reachableStates: 5 },
//   { name: "limit-push-1-per-test",        reachableStates: 3 },
// ]

const manager = createGateManager(nets, { mode: "enforce" });
```

### Rule types

**`require A before B`** — A must succeed before B is allowed. Resets after B fires.

**`require human-approval before B`** — B requires manual UI confirmation every time.

**`block A`** — A is permanently blocked.

**`limit A to N per session`** — A can fire N times total.

**`limit A to N per action`** — A can fire N times, budget refills when action fires.

### Dot notation for action-dispatch tools

Many tools (Discord, Slack, WhatsApp) use a single tool name with an `action` field in the input. Use dot notation to gate specific actions:

```typescript
const { nets } = compile(`
  require discord.readMessages before discord.sendMessage
  require human-approval before discord.sendMessage
  block discord.timeout
  limit discord.sendMessage to 5 per session
`);
```

`discord.sendMessage` means: tool name is `discord`, input has `action: "sendMessage"`. The compiler generates a `toolMapper` automatically. Actions not mentioned in any rule pass through freely — `discord.react`, `discord.readMessages`, etc. are ungated.

### Tool mapping with `map`

For tools where discrimination requires pattern matching (like `bash` commands), use `map` to define virtual tool names:

```
map bash.command rm as delete
map bash.command cp as backup
map bash.command deploy as deploy-cmd

require backup before delete
require human-approval before deploy-cmd
```

Syntax: `map <tool>.<field> <keyword> as <name>`

- `bash.command` means: match against `input.command` of the `bash` tool
- Bare words use word-boundary matching — `rm` matches `rm -rf build/` but not `format` or `mkdir`
- Unmatched bash commands pass through freely (nets abstain)
- Works with any tool and field, not just bash: `map slack.action sendMessage as slack-send`
- For complex patterns, use regex with `/` delimiters: `map bash.command /cp\s+-r/ as backup`

### Syntax

- One rule per line
- `#` starts a comment (to end of line)
- Blank lines are ignored
- Tool names support dot notation (`tool.action`) for action-dispatch tools
- `map` statements define virtual tool names via regex pattern matching
- Accepts a multiline string or an array of strings

### Verification

`compile()` automatically verifies every net by enumerating all reachable states. This catches unbounded nets, structural errors, and confirms each rule compiles to a finite, well-formed state machine. Verification runs at compile time — before your agent starts.

## Layer 3: Full control

Build custom SkillNets with `defineSkillNet` for complete control over places, transitions, tool mapping, and validation.

```typescript
import { defineSkillNet, createGateManager } from "@petriflow/rules";

const myNet = defineSkillNet({
  name: "my-custom-net",
  places: ["idle", "ready"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "go", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["my-tool"] },
  ],
  freeTools: ["read", "ls"],
  terminalPlaces: [],
});

const manager = createGateManager([myNet], { mode: "enforce" });
```

## Mixing layers

All three layers produce SkillNets and compose naturally:

```typescript
import { compile, backupBeforeDelete, defineSkillNet, createGateManager } from "@petriflow/rules";

const { nets: dslNets } = compile("block rm");
const preset = backupBeforeDelete();
const custom = defineSkillNet({ /* ... */ });

const manager = createGateManager([...dslNets, preset, custom], { mode: "enforce" });
```
