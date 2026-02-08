import { describe, it, expect, afterAll } from "bun:test";
import { analyse, toNet } from "@petriflow/engine";
import { reachableStates } from "petri-ts";
import { definition, ITERATION_BUDGET } from "@petriflow/workflow-agent-benchmark";
import { analyseCalls } from "@petriflow/workflow-agent-benchmark/call-analysis";
import n8nWorkflow from "./workflow.json";

// Representative execution path: all tools dispatched, code approved, no iteration
const FULL_PATH = [
  "plan",
  "distribute",
  "dispatchSearch",
  "dispatchDB",
  "dispatchCode",
  "completeSearch",
  "completeDB",
  "requestApproval",
  "approveCode",
  "executeCode",
  "joinResults",
  "generate",
];

describe("PetriFlow vs n8n: agent benchmark comparison", () => {
  const petriResult = analyse(definition);
  const callResult = analyseCalls(definition, {
    humanPlaces: ["humanApproval"],
    executionPath: FULL_PATH,
  });

  // ─── LLM Call Analysis ───

  it("PetriFlow: 4 LLM calls unbatched, 2 batched", () => {
    expect(callResult.petriflow.llmCalls).toBe(4);
    expect(callResult.petriflow.batchedLlmCalls).toBe(2);
    // Unbatched: dispatchSearch, dispatchDB, dispatchCode, generate = 4
    // Batched: 3 tool decisions → 1 batch + generate = 2
  });

  it("detects 1 concurrent batch group (3 tool decisions)", () => {
    expect(callResult.concurrentGroups).toHaveLength(1);
    expect(callResult.concurrentGroups[0]).toHaveLength(3);

    const places = callResult.concurrentGroups[0]!.map((cp) => cp.place);
    expect(places).toContain("searchDecision");
    expect(places).toContain("dbDecision");
    expect(places).toContain("codeDecision");
  });

  it("ReAct baseline: 11 LLM calls for the same execution", () => {
    expect(callResult.react.llmCalls).toBe(11);
  });

  it("81.8% fewer LLM calls with batching vs ReAct", () => {
    // (11 - 2) / 11 = 81.8%
    expect(callResult.batchedReductionPercent).toBe(81.8);
  });

  it("identifies exactly 5 choice points", () => {
    expect(callResult.choicePoints).toHaveLength(5);

    const llmChoices = callResult.choicePoints.filter(
      (cp) => cp.class === "llm",
    );
    const humanChoices = callResult.choicePoints.filter(
      (cp) => cp.class === "human",
    );

    expect(llmChoices).toHaveLength(4);
    expect(humanChoices).toHaveLength(1);
  });

  it("7 of 12 firings are deterministic (no LLM needed)", () => {
    expect(callResult.petriflow.deterministicFirings).toBe(7);
  });

  // ─── n8n Structural Analysis ───

  it("n8n workflow has same node count but no formal semantics", () => {
    expect(n8nWorkflow.nodes.length).toBe(20);

    const llmNodes = n8nWorkflow.nodes.filter(
      (n) => n.type === "@n8n/n8n-nodes-langchain.openAi",
    );
    expect(llmNodes).toHaveLength(2);
  });

  // ─── Property Comparison ───

  it("PetriFlow proves termination — n8n cannot", () => {
    expect(petriResult.unexpectedTerminalStates).toHaveLength(0);
    expect(petriResult.validTerminalStates.length).toBeGreaterThan(0);

    for (const state of petriResult.validTerminalStates) {
      expect(state.responseGenerated).toBe(1);
    }

    const iterationNode = n8nWorkflow.nodes.find(
      (n) => n.name === "Check Iteration",
    )!;
    expect(iterationNode.type).toBe("n8n-nodes-base.code");
    expect(iterationNode.parameters!.jsCode).toContain("maxIterations");
  });

  it("PetriFlow proves human gate — n8n cannot", () => {
    for (const t of definition.net.transitions) {
      if (t.inputs.includes("codePending")) {
        expect(t.outputs).not.toContain("codeDone");
      }
    }

    const codeConnections = n8nWorkflow.connections["Use Code?"];
    expect(codeConnections.main[0]![0]!.node).toBe("Wait for Approval");
  });

  it("PetriFlow proves no orphaned work — n8n cannot", () => {
    const join = definition.net.transitions.find(
      (t) => t.name === "joinResults",
    )!;
    expect(join.inputs).toHaveLength(3);

    const net = toNet(definition.net);
    const terminal = reachableStates(net).filter(
      (s) => s.responseGenerated > 0,
    );
    for (const state of terminal) {
      expect(state.searchPending).toBe(0);
      expect(state.dbPending).toBe(0);
      expect(state.codePending).toBe(0);
    }

    const merge = n8nWorkflow.nodes.find((n) => n.name === "Merge Results")!;
    expect(merge.parameters!.mode).toBe("append");
  });

  it("PetriFlow proves bounded iterations — n8n cannot", () => {
    const allStates = reachableStates(toNet(definition.net));
    for (const state of allStates) {
      expect(state.iterationBudget).toBeLessThanOrEqual(ITERATION_BUDGET);
      expect(state.iterationBudget).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── Summary Output ───

  afterAll(() => {
    const line = (label: string, petri: string, n8n: string, react: string) =>
      `  ${label.padEnd(30)} ${petri.padEnd(24)} ${n8n.padEnd(22)} ${react}`;

    console.log("\n┌───────────────────────────────────────────────────────────────────────────────────────────────┐");
    console.log("│                          PetriFlow vs n8n vs ReAct: Agent Benchmark                          │");
    console.log("├───────────────────────────────────────────────────────────────────────────────────────────────┤");
    console.log(line("", "PetriFlow", "n8n", "ReAct"));
    console.log(line("─".repeat(30), "─".repeat(24), "─".repeat(22), "─".repeat(12)));
    console.log(line(
      "LLM calls (unbatched)",
      `${callResult.petriflow.llmCalls}`,
      "2 (plan + evaluate)",
      `${callResult.react.llmCalls}`,
    ));
    console.log(line(
      "LLM calls (batched)",
      `${callResult.petriflow.batchedLlmCalls}`,
      "2 (plan + evaluate)",
      `${callResult.react.llmCalls}`,
    ));
    console.log(line(
      "Reduction vs ReAct",
      `${callResult.batchedReductionPercent}%`,
      `${Math.round(((callResult.react.llmCalls - 2) / callResult.react.llmCalls) * 1000) / 10}%`,
      "baseline",
    ));
    console.log(line(
      "Termination proven",
      `YES (${petriResult.reachableStateCount} states)`,
      "NO (runtime check)",
      "NO (hope)",
    ));
    console.log(line(
      "Human gate proven",
      "YES (structural)",
      "NO (convention)",
      "NO (if-statement)",
    ));
    console.log(line(
      "No orphaned work",
      "YES (join semantics)",
      "NO (append mode)",
      "NO (implicit)",
    ));
    console.log(line(
      "Bounded iterations",
      `YES (budget=${ITERATION_BUDGET})`,
      "NO (JS variable)",
      "NO (counter)",
    ));
    console.log(line(
      "Reachable states analysed",
      `${petriResult.reachableStateCount}`,
      "N/A",
      "N/A",
    ));
    console.log(line(
      "Terminal states (all valid)",
      `${petriResult.validTerminalStates.length}`,
      "N/A",
      "N/A",
    ));
    console.log("└───────────────────────────────────────────────────────────────────────────────────────────────┘\n");

    console.log("  Batching: distribute produces searchDecision + dbDecision + codeDecision simultaneously.");
    console.log("  These are independent choice points → 1 LLM call: \"which tools do you want?\"\n");

    console.log("  Note: These proofs are about orchestration, not intelligence.");
    console.log("  PetriFlow proves the agent terminates, hits the human gate, and waits");
    console.log("  for all tools. It cannot prove the agent gives good answers or calls");
    console.log("  the right tools. The net is the safety rails; the LLM is the driver.\n");
  });
});
