# OpenClaw Safety Benchmark: Structural vs Policy-Based Security

OpenClaw is a personal AI assistant with shell access, messaging, browser control, and more. Its security relies on three **policy-based** layers: tool allow/deny lists, Docker sandboxing, and elevated-mode approval gates. They have TLA+ formal models in a separate repo, but those model the policy spec, not the runtime — with explicit caveats about model-to-code drift.

Their own docs state the core problem: *"Most failures are not fancy exploits — they're someone messaged the bot and the bot did what they asked."*

This package benchmarks Petri net **structural safety** against that policy model. Where OpenClaw says "the runtime will check," the Petri net says "the topology makes it impossible." Properties are proved exhaustively across all reachable states.

## Scenarios

### 1. Tool Execution with Approval Gate

| | OpenClaw (policy) | PetriFlow (structure) |
|---|---|---|
| **Approach** | `if (!approvalId \|\| expired(approvalId)) deny()` | `execShell` requires `shellApproved` token from manual `approveShell` |
| **Bypass possible?** | Bug in check, expired token race, code path that skips check | No — topology makes bypass impossible |
| **Proof method** | Unit tests, code review | Exhaustive state space enumeration |

### 2. Inbound Message Gating

| | OpenClaw (policy) | PetriFlow (structure) |
|---|---|---|
| **Approach** | `dmPolicy="pairing"`, runtime DB check against allowlist | Linear pipeline: every path passes through full pairing flow |
| **Bypass possible?** | DB misconfiguration, policy flag not checked on new code path | No — no transition connects unknown/pairingPrompted to processing |
| **Proof method** | Integration tests | Token conservation invariant (sum=1 always) |

### 3. Tool Budget & Escalation Prevention

| | OpenClaw (policy) | PetriFlow (structure) |
|---|---|---|
| **Approach** | Tool deny-lists block privileged calls at runtime | `execPrivileged` requires `privilegeToken` (starts at 0, never produced) |
| **Bypass possible?** | Deny-list incomplete, prompt injection names unlisted tool | No — `privilegedDone` provably 0 in ALL reachable states |
| **Proof method** | Allowlist maintenance, red-teaming | Dead transition proof via exhaustive enumeration |

### 4. Sandbox Escape Prevention

| | OpenClaw (policy) | PetriFlow (structure) |
|---|---|---|
| **Approach** | Docker sandbox + elevated escape hatch + approval gates | `runHost` requires `elevationApproved` from manual `approveElevation` |
| **Bypass possible?** | Container escape, misconfigured volume mount, approval gate bug | No — only manual `approveElevation` produces the required token |
| **Proof method** | Container hardening, penetration testing | Structural proof + locked variant (approve transition removed) |

**Locked sandbox variant:** Same net with `approveElevation` removed entirely. `elevationApproved` never gets a token, `runHost` is provably dead. Host execution places are 0 in every reachable state.

## Running

```bash
# Run tests (all safety proofs)
bun test comparisons/openclaw-safety/

# Run CLI summary
bun run comparisons/openclaw-safety/src/index.ts
```

## Key Insight

OpenClaw's security is **policy-based**: the runtime checks conditions and denies access if they fail. This works until someone finds a code path that doesn't check, a race condition in token expiry, or a prompt injection that names a tool not on the deny-list.

Petri net security is **structural**: the network topology makes violations impossible. There is no code path to check because the transition literally cannot fire without the required input token. Properties are proved exhaustively across every reachable state, not tested on sample inputs.

Both approaches have value. Policy-based security is flexible and easy to update. Structural security is rigid but provably correct. This benchmark demonstrates the difference.
