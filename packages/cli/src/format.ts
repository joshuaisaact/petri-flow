import type { WorkflowAnalysisResult } from "@petriflow/engine";
import type { Marking } from "petri-ts";

const useColor =
  !process.env.NO_COLOR && process.stdout.isTTY;

const BOLD = useColor ? "\x1b[1m" : "";
const GREEN = useColor ? "\x1b[32m" : "";
const RED = useColor ? "\x1b[31m" : "";
const YELLOW = useColor ? "\x1b[33m" : "";
const CYAN = useColor ? "\x1b[36m" : "";
const DIM = useColor ? "\x1b[2m" : "";
const RESET = useColor ? "\x1b[0m" : "";

function formatMarking(state: Marking<string>): string {
  return Object.entries(state)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => (v === 1 ? k : `${k}(${v})`))
    .join(", ");
}

export function formatAnalysis(result: WorkflowAnalysisResult<string>): string {
  const lines: string[] = [];

  lines.push(`${BOLD}${CYAN}Workflow: ${result.workflowName}${RESET}`);
  lines.push("");

  lines.push(`  Reachable states: ${BOLD}${result.reachableStateCount}${RESET}`);

  // Terminal states with valid/unexpected breakdown
  const hasTerminalInfo = result.validTerminalStates.length > 0 || result.unexpectedTerminalStates.length > 0;

  if (hasTerminalInfo && result.unexpectedTerminalStates.length === 0) {
    lines.push(
      `  Terminal states:  ${BOLD}${GREEN}${result.terminalStates.length}${RESET} ${DIM}(all valid)${RESET}`,
    );
    for (const state of result.validTerminalStates) {
      lines.push(`    ${GREEN}✓${RESET} ${formatMarking(state)}`);
    }
  } else if (hasTerminalInfo && result.unexpectedTerminalStates.length > 0) {
    lines.push(
      `  Terminal states:  ${BOLD}${RED}${result.terminalStates.length}${RESET} ${DIM}(${result.unexpectedTerminalStates.length} unexpected)${RESET}`,
    );
    for (const state of result.validTerminalStates) {
      lines.push(`    ${GREEN}✓${RESET} ${formatMarking(state)}`);
    }
    for (const state of result.unexpectedTerminalStates) {
      lines.push(`    ${RED}✗${RESET} ${formatMarking(state)} ${RED}(stuck)${RESET}`);
    }
  } else {
    // No terminal places declared
    lines.push(`  Terminal states:  ${BOLD}${result.terminalStates.length}${RESET}`);
    for (const state of result.terminalStates) {
      lines.push(`    → ${formatMarking(state)}`);
    }
  }

  if (result.invariants.length > 0) {
    lines.push("");
    lines.push(`  ${BOLD}Invariants:${RESET}`);
    for (const inv of result.invariants) {
      const status = inv.holds
        ? `${GREEN}holds${RESET}`
        : `${RED}VIOLATED${RESET}`;
      const weights = Object.entries(inv.weights)
        .map(([k, v]) => `${v}·${k}`)
        .join(" + ");
      lines.push(`    ${weights} = const → ${status}`);
    }
  }

  return lines.join("\n");
}

export function formatJson(result: WorkflowAnalysisResult<string>): string {
  return JSON.stringify(result, null, 2);
}
