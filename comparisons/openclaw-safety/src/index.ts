import { analyse, toNet } from "@petriflow/engine";
import { reachableStates, terminalStates, checkInvariant } from "petri-ts";

import { definition as toolApproval } from "./scenarios/tool-approval.js";
import { definition as messageGating } from "./scenarios/message-gating.js";
import { definition as budgetEscalation, TOOL_BUDGET } from "./scenarios/budget-escalation.js";
import {
  definition as sandboxIsolation,
  lockedDefinition as sandboxLocked,
  SANDBOX_BUDGET,
} from "./scenarios/sandbox-isolation.js";

export {
  toolApproval,
  messageGating,
  budgetEscalation,
  sandboxIsolation,
  sandboxLocked,
  TOOL_BUDGET,
  SANDBOX_BUDGET,
};

// --- CLI runner ---

interface ScenarioResult {
  name: string;
  reachableCount: number;
  terminalCount: number;
  deadlockFree: boolean;
  openclawApproach: string;
  petriProof: string;
}

function runScenario(
  name: string,
  def: typeof toolApproval,
  openclawApproach: string,
  petriProof: string,
): ScenarioResult {
  const result = analyse(def);
  return {
    name,
    reachableCount: result.reachableStateCount,
    terminalCount: result.terminalStates.length,
    deadlockFree: result.unexpectedTerminalStates.length === 0,
    openclawApproach,
    petriProof,
  };
}

const scenarios: ScenarioResult[] = [
  runScenario(
    "1. Tool Approval Gate",
    toolApproval,
    "Runtime check: if (!approvalId || expired(approvalId)) deny()",
    "Structural: execShell requires shellApproved token from manual approveShell",
  ),
  runScenario(
    "2. Message Gating",
    messageGating,
    "Runtime check: dmPolicy=\"pairing\", DB lookup against allowlist",
    "Structural: all paths from unknownSender to processing pass through pairing flow",
  ),
  runScenario(
    "3. Budget & Escalation",
    budgetEscalation,
    "Runtime check: tool deny-list blocks privileged calls",
    "Structural: execPrivileged requires privilegeToken (starts at 0, never produced)",
  ),
  runScenario(
    "4. Sandbox Isolation",
    sandboxIsolation,
    "Runtime check: Docker sandbox + elevated mode approval gates",
    "Structural: runHost requires elevationApproved from manual approveElevation",
  ),
];

// Locked variant
const lockedResult = analyse(sandboxLocked);
const lockedNet = toNet(sandboxLocked.net);
const lockedReachable = reachableStates(lockedNet);
const hostPlaces = ["hostExecRunning", "hostExecDone"] as const;
const lockedHostAlways0 = lockedReachable.every((s) =>
  hostPlaces.every((p) => s[p] === 0),
);

// Print results
const line = (label: string, openclaw: string, petri: string) =>
  `  ${label.padEnd(28)} ${openclaw.padEnd(38)} ${petri}`;

console.log("\n┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐");
console.log("│                    OpenClaw Safety: Policy-Based vs Structural Security                           │");
console.log("├─────────────────────────────────────────────────────────────────────────────────────────────────────┤");

for (const s of scenarios) {
  console.log(`\n  ${s.name}`);
  console.log(line("", "OpenClaw (policy)", "PetriFlow (structure)"));
  console.log(line("─".repeat(28), "─".repeat(38), "─".repeat(38)));
  console.log(line("Approach", s.openclawApproach.slice(0, 36), s.petriProof.slice(0, 36)));
  console.log(line("Reachable states analysed", "N/A", String(s.reachableCount)));
  console.log(line("Terminal states", "N/A", String(s.terminalCount)));
  console.log(line("Deadlock-free", "N/A", s.deadlockFree ? "YES" : "NO"));
}

console.log(`\n  4b. Locked Sandbox Variant`);
console.log(line("Host places always 0", "N/A", lockedHostAlways0 ? "YES (proven)" : "NO"));
console.log(line("Reachable states", "N/A", String(lockedResult.reachableStateCount)));

console.log("\n└─────────────────────────────────────────────────────────────────────────────────────────────────────┘");

console.log("\n  Key insight: OpenClaw's safety relies on runtime checks that can be");
console.log("  bypassed if the code has bugs or the policy is misconfigured.");
console.log("  Petri net safety is structural — the topology makes violations impossible.");
console.log("  Properties are proved exhaustively across ALL reachable states.\n");
