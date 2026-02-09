import {
  analyse as baseAnalyse,
  type AnalysisResult as BaseAnalysisResult,
  type AnalyseOptions as BaseAnalyseOptions,
} from "petri-ts";
import type { Marking } from "petri-ts";
import type { WorkflowDefinition } from "./types.js";
import { toNet } from "./workflow.js";

export type WorkflowAnalysisResult<Place extends string> =
  BaseAnalysisResult<Place> & {
    workflowName: string;
    validTerminalStates: Marking<Place>[];
    unexpectedTerminalStates: Marking<Place>[];
  };

export type AnalyseOptions<Place extends string> = BaseAnalyseOptions<Place>;

function isValidTerminal<Place extends string>(
  state: Marking<Place>,
  terminalPlaces: Place[],
): boolean {
  return terminalPlaces.some((p) => state[p] > 0);
}

export function analyse<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
>(
  definition: WorkflowDefinition<Place, Ctx>,
  options: AnalyseOptions<Place> = {},
): WorkflowAnalysisResult<Place> {
  const mergedOptions: AnalyseOptions<Place> = {
    ...options,
    invariants: options.invariants ?? definition.invariants,
  };

  const result = baseAnalyse(toNet(definition.net), mergedOptions);
  const terminalPlaces = definition.terminalPlaces;

  let validTerminalStates: Marking<Place>[];
  let unexpectedTerminalStates: Marking<Place>[];

  if (terminalPlaces.length > 0) {
    validTerminalStates = result.terminalStates.filter((s) =>
      isValidTerminal(s, terminalPlaces),
    );
    unexpectedTerminalStates = result.terminalStates.filter(
      (s) => !isValidTerminal(s, terminalPlaces),
    );
  } else {
    // Empty terminal places — all terminal states are valid (can't distinguish)
    validTerminalStates = result.terminalStates;
    unexpectedTerminalStates = [];
  }

  return {
    ...result,
    workflowName: definition.name,
    validTerminalStates,
    unexpectedTerminalStates,
  };
}
