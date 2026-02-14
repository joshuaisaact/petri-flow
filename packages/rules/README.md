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

const { nets } = compile(`
  require backup before delete
  require human-approval before deploy
  block rm
  limit push to 3 per session
  limit push to 1 per test    # refill budget after each test
`);

const manager = createGateManager(nets, { mode: "enforce" });
```

### Rule types

**`require A before B`** — A must succeed before B is allowed. Resets after B fires.

**`require human-approval before B`** — B requires manual UI confirmation every time.

**`block A`** — A is permanently blocked.

**`limit A to N per session`** — A can fire N times total.

**`limit A to N per action`** — A can fire N times, budget refills when action fires.

### Syntax

- One rule per line
- `#` starts a comment (to end of line)
- Blank lines are ignored
- Accepts a multiline string or an array of strings

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
