# @petriflow/rules

Declarative rules DSL for PetriFlow tool gating.

## Declarative DSL

Write rules in a `.rules` file or as inline strings. The compiler turns each rule into a verified SkillNet.

```
# safety.rules
require backup before delete
require human-approval before deploy
block rm
limit push to 3 per session
limit push to 1 per test    # refill budget after each test
```

```typescript
import { compileFile, createGateManager } from "@petriflow/rules";

const { nets, verification } = compileFile("./safety.rules");

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

`compile()` also accepts inline strings if you prefer:

```typescript
import { compile } from "@petriflow/rules";

const { nets } = compile(`
  require backup before delete
  block rm
`);
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

## How rules compose

Each rule compiles to its own independent Petri net. At runtime, every net is checked on every tool call — a tool can only fire if **all** nets allow it.

```
require lint before test
require test before deploy
```

This produces two separate nets, not one. But the effect is transitive: `deploy` requires `test` (net 2), and `test` requires `lint` (net 1), so `deploy` implicitly requires `lint → test → deploy`.

This works because safety properties compose by intersection. If net A says "no deploy without lint" and net B says "no deploy without test," enforcing both gives you "no deploy without lint AND test." No coordination between nets is needed — they don't know about each other.

The practical consequence: each net is small enough to verify exhaustively (a few reachable states), but their combined enforcement covers complex multi-step policies. You get compositional guarantees without a combinatorial explosion.

## Custom SkillNets

For complete control, build custom SkillNets with `defineSkillNet`:

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

## Composing rules and custom nets

DSL rules and custom SkillNets compose naturally:

```typescript
import { compile, defineSkillNet, createGateManager } from "@petriflow/rules";

const { nets: dslNets } = compile("block rm");
const custom = defineSkillNet({ /* ... */ });

const manager = createGateManager([...dslNets, custom], { mode: "enforce" });
```
