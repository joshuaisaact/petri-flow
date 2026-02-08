# Agent Benchmark: PetriFlow vs n8n vs ReAct

An LLM agent with 3 tools (web search, database lookup, code execution) modeled as a Petri net. Code execution requires human approval. The agent can iterate up to 3 times before it must respond.

The same agent is modeled in PetriFlow (16 places, 17 transitions), n8n (20 nodes), and compared against a ReAct baseline.

## Results

```
                               PetriFlow                n8n                    ReAct
────────────────────────────── ──────────────────────── ────────────────────── ────────────
LLM calls (batched)            2                        2 (plan + evaluate)    11
Reduction vs ReAct             81.8%                    81.8%                  baseline
Termination proven             YES (196 states)         NO (runtime check)     NO (hope)
Human gate proven              YES (structural)         NO (convention)        NO (if-statement)
No orphaned work               YES (join semantics)     NO (append mode)       NO (implicit)
Bounded iterations             YES (budget=3)           NO (JS variable)       NO (counter)
Reachable states analysed      196                      N/A                    N/A
Terminal states (all valid)    4                        N/A                    N/A
```

Same LLM call efficiency. Only one proves anything.

## What the proofs mean

**Termination.** Every path through the 196 reachable states reaches `responseGenerated`. (16 binary places would allow 65,536 states — 99.7% of the state space is unreachable. That's the topology constraining the system.) The iteration budget is 3 tokens consumed by the `iterate` transition. When they're gone, only `generate` is fireable. No infinite loops — proven exhaustively, not by testing.

**Human gate.** There is no transition in the net from `codePending` to `codeDone`. The only path is `codePending → humanApproval → (approve → execute | reject) → codeDone`. This is a topological fact, not a runtime check. In n8n, the approval node exists but an edge could bypass it.

**No orphaned work.** `joinResults` requires tokens from `searchDone`, `dbDone`, and `codeDone`. If a tool is dispatched, it must complete. If it's skipped, a `skip*` transition places the done token directly. No partial results — the join is structural.

**Bounded iterations.** `iterationBudget` starts at 3. Each `iterate` consumes one. Across all 196 reachable states, budget stays in [0, 3]. No configuration file to edit, no variable to change — the bound is in the topology.

## How batching works

After planning, `distribute` produces tokens in three independent decision places simultaneously:

```
distribute: planReady → searchDecision, dbDecision, codeDecision
```

Each has a dispatch/skip choice. Because they're independent (separate places, no shared transitions), the scheduler detects them as one concurrent batch group and asks the LLM a single question: *"which tools do you want?"*

This is not a special case — the analysis finds concurrent groups automatically by checking which transitions produce tokens in multiple choice points.

## What this doesn't prove

These proofs are about orchestration, not intelligence. PetriFlow proves the agent terminates, hits the human gate, and waits for all tools. It cannot prove the agent gives good answers, calls the right tools, or uses the budget wisely. The net is the safety rails. The LLM is the driver. We're proving the rails are sound, not that the driver is competent.

The proofs are also only as good as the net definition. If someone adds a transition that bypasses the human gate, the analyser will happily report the (now different) net's properties. The net *is* the specification — if the spec is wrong, the proofs are correct but useless. This is true of all formal methods.

No existing orchestration framework proves either. PetriFlow proves the half that's provable.

## Reproducing

```bash
# Run the formal property proofs (196 states × 4 properties)
bun test workflows/agent-benchmark/

# Run the three-way comparison
bun test comparisons/n8n/

# CLI analysis
bunx petriflow analyse workflows/agent-benchmark/index.ts --strict
```

---

<sup>The TB-CSPN paper (*Beyond Prompt Chaining*, Future Internet, August 2025) found 66.7% fewer LLM API calls using Petri net orchestration vs LangGraph. With concurrent batching, PetriFlow and n8n both reach 81.8% — the call count advantage disappears. What remains is the proofs.</sup>
