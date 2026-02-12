import { describe, it, expect, afterAll } from "bun:test";
import { analyse, toNet } from "@petriflow/engine";
import { reachableStates, terminalStates, checkInvariant } from "petri-ts";

import { definition as toolApproval } from "./scenarios/tool-approval.js";
import { definition as messageGating } from "./scenarios/message-gating.js";
import {
  definition as budgetEscalation,
  TOOL_BUDGET,
} from "./scenarios/budget-escalation.js";
import {
  definition as sandboxIsolation,
  lockedDefinition as sandboxLocked,
  SANDBOX_BUDGET,
} from "./scenarios/sandbox-isolation.js";

// ════════════════════════════════════════════════════════════════
// Scenario 1: Tool Execution with Approval Gate
// ════════════════════════════════════════════════════════════════

describe("Scenario 1: Tool Approval Gate", () => {
  const net = toNet(toolApproval.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(toolApproval);

  // --- Structural: no transition shortcuts shell past approval ---

  it("no transition produces shellApproved except approveShell", () => {
    for (const t of toolApproval.net.transitions) {
      if (t.name !== "approveShell") {
        expect(t.outputs).not.toContain("shellApproved");
      }
    }
  });

  it("approveShell is type manual (requires human)", () => {
    const approve = toolApproval.net.transitions.find(
      (t) => t.name === "approveShell",
    )!;
    expect(approve.type).toBe("manual");
    expect(approve.inputs).toContain("shellAwaitingApproval");
    expect(approve.outputs).toContain("shellApproved");
  });

  it("execShell requires shellApproved token", () => {
    const exec = toolApproval.net.transitions.find(
      (t) => t.name === "execShell",
    )!;
    expect(exec.inputs).toContain("shellApproved");
    expect(exec.inputs).toContain("budget");
  });

  // --- Search/fileRead are independent of approval ---

  it("search and fileRead do not require approval", () => {
    const search = toolApproval.net.transitions.find(
      (t) => t.name === "execSearch",
    )!;
    const fileRead = toolApproval.net.transitions.find(
      (t) => t.name === "execFileRead",
    )!;

    expect(search.inputs).not.toContain("shellApproved");
    expect(search.inputs).not.toContain("shellAwaitingApproval");
    expect(fileRead.inputs).not.toContain("shellApproved");
    expect(fileRead.inputs).not.toContain("shellAwaitingApproval");
  });

  // --- All paths terminate ---

  it("all terminal states have responseGenerated=1", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      expect(state.responseGenerated).toBe(1);
    }
  });

  it("no unexpected terminal states (no deadlocks)", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  // --- Flow conservation invariant ---

  it("flow conservation: weighted sum constant across all reachable states", () => {
    // idle/taskReceived/resultsReady/responseGenerated track the main flow (weight 3)
    // Each track place gets weight 1
    const weights = {
      idle: 3,
      taskReceived: 3,
      searchReady: 1,
      searchDone: 1,
      fileReadReady: 1,
      fileReadDone: 1,
      shellPending: 1,
      shellAwaitingApproval: 1,
      shellApproved: 1,
      shellDone: 1,
      resultsReady: 3,
      responseGenerated: 3,
      budget: 0,
    };
    expect(checkInvariant(net, weights)).toBe(true);
  });

  // --- Budget bounded ---

  it("budget is bounded in [0, 3]", () => {
    for (const state of reachable) {
      expect(state.budget).toBeGreaterThanOrEqual(0);
      expect(state.budget).toBeLessThanOrEqual(3);
    }
  });

  it("reachable state space is finite", () => {
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(10000);
  });
});

// ════════════════════════════════════════════════════════════════
// Scenario 2: Inbound Message Gating
// ════════════════════════════════════════════════════════════════

describe("Scenario 2: Message Gating", () => {
  const net = toNet(messageGating.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(messageGating);

  // --- No transition connects unknown/pairingPrompted directly to processing ---

  it("no transition connects unknownSender directly to processing", () => {
    for (const t of messageGating.net.transitions) {
      if (t.inputs.includes("unknownSender")) {
        expect(t.outputs).not.toContain("processing");
      }
    }
  });

  it("no transition connects pairingPrompted directly to processing", () => {
    for (const t of messageGating.net.transitions) {
      if (t.inputs.includes("pairingPrompted")) {
        expect(t.outputs).not.toContain("processing");
      }
    }
  });

  it("only pairedSender leads to processing", () => {
    const toProcessing = messageGating.net.transitions.filter((t) =>
      t.outputs.includes("processing"),
    );
    expect(toProcessing).toHaveLength(1);
    expect(toProcessing[0]!.inputs).toContain("pairedSender");
  });

  // --- Exactly 1 token at all times ---

  it("exactly 1 token in every reachable state", () => {
    const places = Object.keys(net.initialMarking) as string[];
    for (const state of reachable) {
      const total = places.reduce(
        (sum, p) => sum + (state[p as keyof typeof state] ?? 0),
        0,
      );
      expect(total).toBe(1);
    }
  });

  // --- Token conservation invariant ---

  it("token conservation: all weights=1, sum=1", () => {
    const weights: Record<string, number> = {};
    for (const p of Object.keys(net.initialMarking)) {
      weights[p] = 1;
    }
    expect(checkInvariant(net, weights)).toBe(true);
  });

  // --- All paths terminate ---

  it("all terminal states are responseDelivered or rejected", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      const delivered = state.responseDelivered ?? 0;
      const rejected = state.rejected ?? 0;
      expect(delivered + rejected).toBe(1);
    }
  });

  it("no unexpected deadlocks", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  it("reachable state space is finite", () => {
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(10000);
  });
});

// ════════════════════════════════════════════════════════════════
// Scenario 3: Tool Budget & Escalation Prevention
// ════════════════════════════════════════════════════════════════

describe("Scenario 3: Budget & Escalation Prevention", () => {
  const net = toNet(budgetEscalation.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(budgetEscalation);

  // --- privilegedDone == 0 in ALL reachable states ---

  it("privilegedDone is 0 in every reachable state (dead transition)", () => {
    for (const state of reachable) {
      expect(state.privilegedDone).toBe(0);
    }
  });

  it("privilegeToken is 0 in every reachable state (never produced)", () => {
    for (const state of reachable) {
      expect(state.privilegeToken).toBe(0);
    }
  });

  it("no transition produces privilegeToken", () => {
    for (const t of budgetEscalation.net.transitions) {
      expect(t.outputs).not.toContain("privilegeToken");
    }
  });

  // --- Budget conservation ---

  it("budget conservation: toolBudget + searchDone + fileDone + privilegedDone = TOOL_BUDGET", () => {
    const weights = {
      idle: 0,
      toolChoice: 0,
      searchDone: 1,
      fileDone: 1,
      privilegedDone: 1,
      responseGenerated: 0,
      toolBudget: 1,
      privilegeToken: 0,
    };
    expect(checkInvariant(net, weights)).toBe(true);
  });

  // --- Budget bounded ---

  it(`toolBudget stays in [0, ${TOOL_BUDGET}]`, () => {
    for (const state of reachable) {
      expect(state.toolBudget).toBeGreaterThanOrEqual(0);
      expect(state.toolBudget).toBeLessThanOrEqual(TOOL_BUDGET);
    }
  });

  // --- All paths terminate ---

  it("all terminal states have responseGenerated=1", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      expect(state.responseGenerated).toBe(1);
    }
  });

  it("no unexpected deadlocks", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  it("reachable state space is finite", () => {
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(10000);
  });
});

// ════════════════════════════════════════════════════════════════
// Scenario 4: Sandbox Escape Prevention
// ════════════════════════════════════════════════════════════════

describe("Scenario 4: Sandbox Isolation", () => {
  const net = toNet(sandboxIsolation.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(sandboxIsolation);

  // --- Only approveElevation (manual) produces elevationApproved ---

  it("only approveElevation produces elevationApproved", () => {
    for (const t of sandboxIsolation.net.transitions) {
      if (t.name !== "approveElevation") {
        expect(t.outputs).not.toContain("elevationApproved");
      }
    }
  });

  it("approveElevation is type manual", () => {
    const approve = sandboxIsolation.net.transitions.find(
      (t) => t.name === "approveElevation",
    )!;
    expect(approve.type).toBe("manual");
  });

  // --- denyElevation returns to sandbox ---

  it("denyElevation returns to sandboxReady", () => {
    const deny = sandboxIsolation.net.transitions.find(
      (t) => t.name === "denyElevation",
    )!;
    expect(deny.inputs).toContain("elevationRequested");
    expect(deny.outputs).toContain("sandboxReady");
  });

  // --- All paths terminate ---

  it("all terminal states have done=1", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      expect(state.done).toBe(1);
    }
  });

  it("no unexpected deadlocks", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  // --- Budget bounded ---

  it(`budget stays in [0, ${SANDBOX_BUDGET}]`, () => {
    for (const state of reachable) {
      expect(state.budget).toBeGreaterThanOrEqual(0);
      expect(state.budget).toBeLessThanOrEqual(SANDBOX_BUDGET);
    }
  });

  it("reachable state space is finite", () => {
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(10000);
  });
});

// ════════════════════════════════════════════════════════════════
// Scenario 4b: Locked Sandbox (approveElevation removed)
// ════════════════════════════════════════════════════════════════

describe("Scenario 4b: Locked Sandbox", () => {
  const net = toNet(sandboxLocked.net);
  const reachable = reachableStates(net);
  const terminal = terminalStates(net);
  const result = analyse(sandboxLocked);

  // --- Host places always 0 ---

  it("hostExecRunning is 0 in every reachable state", () => {
    for (const state of reachable) {
      expect(state.hostExecRunning).toBe(0);
    }
  });

  it("hostExecDone is 0 in every reachable state", () => {
    for (const state of reachable) {
      expect(state.hostExecDone).toBe(0);
    }
  });

  it("elevationApproved is 0 in every reachable state", () => {
    for (const state of reachable) {
      expect(state.elevationApproved).toBe(0);
    }
  });

  // --- All paths terminate ---

  it("all terminal states have done=1", () => {
    expect(terminal.length).toBeGreaterThan(0);
    for (const state of terminal) {
      expect(state.done).toBe(1);
    }
  });

  it("no unexpected deadlocks", () => {
    expect(result.unexpectedTerminalStates).toHaveLength(0);
  });

  it("reachable state space is finite", () => {
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(10000);
  });
});

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════

afterAll(() => {
  const scenarios = [
    { name: "Tool Approval Gate", def: toolApproval },
    { name: "Message Gating", def: messageGating },
    { name: "Budget & Escalation", def: budgetEscalation },
    { name: "Sandbox Isolation", def: sandboxIsolation },
    { name: "Locked Sandbox", def: sandboxLocked },
  ];

  const line = (label: string, openclaw: string, petri: string) =>
    `  ${label.padEnd(28)} ${openclaw.padEnd(28)} ${petri}`;

  console.log("\n┌──────────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│              OpenClaw (policy) vs PetriFlow (structure): Safety Proofs              │");
  console.log("├──────────────────────────────────────────────────────────────────────────────────────┤");
  console.log(line("", "OpenClaw", "PetriFlow"));
  console.log(line("─".repeat(28), "─".repeat(28), "─".repeat(28)));

  console.log(line(
    "Shell approval",
    "Runtime if-check",
    "Structural (token gate)",
  ));
  console.log(line(
    "Message sender gating",
    "DB allowlist check",
    "Structural (linear pipeline)",
  ));
  console.log(line(
    "Privilege escalation",
    "Tool deny-list",
    "Dead transition (proven)",
  ));
  console.log(line(
    "Sandbox escape",
    "Docker + approval gate",
    "Structural (manual token)",
  ));
  console.log(line(
    "Locked sandbox host=0",
    "N/A",
    "Exhaustive (all states)",
  ));

  console.log(line("─".repeat(28), "─".repeat(28), "─".repeat(28)));

  for (const s of scenarios) {
    const r = analyse(s.def);
    console.log(line(
      s.name,
      `${r.reachableStateCount} states`,
      `${r.terminalStates.length} terminal, ${r.unexpectedTerminalStates.length} deadlocks`,
    ));
  }

  console.log("└──────────────────────────────────────────────────────────────────────────────────────┘\n");

  console.log("  OpenClaw's own docs: \"Most failures are not fancy exploits —");
  console.log("  they're someone messaged the bot and the bot did what they asked.\"");
  console.log("  Petri net structure makes these failures topologically impossible.\n");
});
