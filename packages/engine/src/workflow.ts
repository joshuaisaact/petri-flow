import type { PetriNet, Marking } from "petri-ts";
import type {
  WorkflowTransition,
  WorkflowNet,
  WorkflowDefinition,
} from "./types.js";

/**
 * Defines a workflow, validating that all transition inputs/outputs
 * reference places that exist in the initial marking.
 */
export function defineWorkflow<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
>(def: {
  name: string;
  places: Place[];
  transitions: WorkflowTransition<Place, Ctx>[];
  initialMarking: Marking<Place>;
  initialContext: Ctx;
  terminalPlaces?: Place[];
  invariants?: { weights: Partial<Record<Place, number>> }[];
}): WorkflowDefinition<Place, Ctx> {
  const placeSet = new Set<string>(def.places);

  for (const t of def.transitions) {
    for (const p of t.inputs) {
      if (!placeSet.has(p)) {
        throw new Error(
          `Transition "${t.name}" references unknown input place "${p}"`,
        );
      }
    }
    for (const p of t.outputs) {
      if (!placeSet.has(p)) {
        throw new Error(
          `Transition "${t.name}" references unknown output place "${p}"`,
        );
      }
    }
  }

  // Validate initial marking references only known places
  for (const p of Object.keys(def.initialMarking)) {
    if (!placeSet.has(p)) {
      throw new Error(
        `Initial marking references unknown place "${p}"`,
      );
    }
  }

  // Validate terminal places reference known places
  if (def.terminalPlaces) {
    for (const p of def.terminalPlaces) {
      if (!placeSet.has(p)) {
        throw new Error(
          `Terminal place "${p}" is not a known place`,
        );
      }
    }
  }

  return {
    name: def.name,
    net: {
      transitions: def.transitions,
      initialMarking: def.initialMarking,
    },
    initialContext: def.initialContext,
    terminalPlaces: def.terminalPlaces,
    invariants: def.invariants,
  };
}

/**
 * Strips workflow extensions (guard, execute, timeout) to produce
 * a plain PetriNet compatible with all petri-ts analysis functions.
 */
export function toNet<Place extends string, Ctx extends Record<string, unknown> = Record<string, unknown>>(
  workflowNet: WorkflowNet<Place, Ctx>,
): PetriNet<Place> {
  return {
    transitions: workflowNet.transitions.map((t) => ({
      name: t.name,
      inputs: t.inputs,
      outputs: t.outputs,
    })),
    initialMarking: workflowNet.initialMarking,
  };
}
