import type { PetriNet, Marking } from "petri-ts";
import type {
  WorkflowTransition,
  WorkflowNet,
  WorkflowDefinition,
  ExecuteFn,
} from "./types.js";
import { compileGuard } from "./guard.js";

/**
 * Input transition type for defineWorkflow — includes execute function
 * which gets extracted into the executors map on the definition.
 */
type TransitionInput<
  Place extends string,
  Ctx extends Record<string, unknown>,
> = WorkflowTransition<Place, Ctx> & {
  execute?: ExecuteFn<Place, Ctx>;
};

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
  transitions: TransitionInput<Place, Ctx>[];
  initialMarking: Marking<Place>;
  initialContext: Ctx;
  terminalPlaces: Place[];
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
    if (t.timeout && !placeSet.has(t.timeout.place)) {
      throw new Error(
        `Transition "${t.name}" timeout references unknown place "${t.timeout.place}"`,
      );
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
  for (const p of def.terminalPlaces) {
    if (!placeSet.has(p)) {
      throw new Error(
        `Terminal place "${p}" is not a known place`,
      );
    }
  }

  // Compile guard expressions into a separate map
  const guards = new Map<string, ReturnType<typeof compileGuard>>();
  for (const t of def.transitions) {
    if (t.guard) {
      guards.set(t.name, compileGuard(t.guard));
    }
  }

  // Extract execute functions into a separate map
  const executors = new Map<string, ExecuteFn<Place, Ctx>>();
  const transitions: WorkflowTransition<Place, Ctx>[] = [];
  for (const t of def.transitions) {
    if (t.execute) {
      executors.set(t.name, t.execute);
    }
    const { execute: _, ...rest } = t;
    transitions.push(rest);
  }

  return {
    name: def.name,
    net: {
      transitions,
      initialMarking: def.initialMarking,
    },
    guards,
    executors,
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
