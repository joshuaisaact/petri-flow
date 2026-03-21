import type { PetriNet, Marking } from "petri-ts";
import type {
  WorkflowTransition,
  WorkflowNet,
  WorkflowDefinition,
  ExecuteFn,
} from "./types.js";
import { compileGuard } from "./guard.js";
import type { NodeExecutor } from "./nodes.js";
import { defaultNodes } from "./nodes.js";

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
}, options?: {
  nodes?: Map<string, NodeExecutor>;
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

  // Compile executors from type + config via node registry
  const nodes = options?.nodes ?? defaultNodes();
  for (const t of transitions) {
    if (executors.has(t.name)) continue;
    if (!t.config) continue;
    const node = nodes.get(t.type);
    if (!node) continue;
    node.validate(t.config);
    const config = t.config;
    executors.set(t.name, ((ctx: Ctx, marking: Marking<Place>) =>
      node.execute({ ctx, marking, config, transitionName: t.name })) as ExecuteFn<Place, Ctx>);
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
 * Expands a workflow definition with new transitions and optional new places.
 * Returns a new WorkflowDefinition — does not mutate the original.
 * Applies the same validation as defineWorkflow().
 */
export function expandWorkflow<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
>(
  definition: WorkflowDefinition<Place, Ctx>,
  newTransitions: TransitionInput<Place, Ctx>[],
  newPlaces?: Place[],
  options?: {
    terminalPlaces?: Place[];
    nodes?: Map<string, NodeExecutor>;
  },
): WorkflowDefinition<Place, Ctx> {
  // Build the full place set: existing places + new places
  const existingPlaces = new Set<string>();
  for (const p of Object.keys(definition.net.initialMarking)) {
    existingPlaces.add(p);
  }
  for (const t of definition.net.transitions) {
    for (const p of t.inputs) existingPlaces.add(p);
    for (const p of t.outputs) existingPlaces.add(p);
    if (t.timeout) existingPlaces.add(t.timeout.place);
  }
  for (const p of definition.terminalPlaces) {
    existingPlaces.add(p);
  }

  const placeSet = new Set<string>(existingPlaces);
  if (newPlaces) {
    for (const p of newPlaces) {
      placeSet.add(p);
    }
  }

  // Validate new transitions reference known places
  for (const t of newTransitions) {
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

  // Validate new terminal places
  const terminalPlaces = options?.terminalPlaces
    ? [...definition.terminalPlaces, ...options.terminalPlaces]
    : [...definition.terminalPlaces];

  for (const p of terminalPlaces) {
    if (!placeSet.has(p)) {
      throw new Error(
        `Terminal place "${p}" is not a known place`,
      );
    }
  }

  // Copy existing guards and executors
  const guards = new Map(definition.guards);
  const executors = new Map(definition.executors);

  // Compile guards for new transitions
  for (const t of newTransitions) {
    if (t.guard) {
      guards.set(t.name, compileGuard(t.guard));
    }
  }

  // Extract execute functions from new transitions
  const newTransitionDefs: WorkflowTransition<Place, Ctx>[] = [];
  for (const t of newTransitions) {
    if (t.execute) {
      executors.set(t.name, t.execute);
    }
    const { execute: _, ...rest } = t;
    newTransitionDefs.push(rest);
  }

  // Compile executors from type + config via node registry
  const nodes = options?.nodes ?? defaultNodes();
  for (const t of newTransitionDefs) {
    if (executors.has(t.name)) continue;
    if (!t.config) continue;
    const node = nodes.get(t.type);
    if (!node) continue;
    node.validate(t.config);
    const config = t.config;
    executors.set(t.name, ((ctx: Ctx, marking: Marking<Place>) =>
      node.execute({ ctx, marking, config, transitionName: t.name })) as ExecuteFn<Place, Ctx>);
  }

  return {
    name: definition.name,
    net: {
      transitions: [...definition.net.transitions, ...newTransitionDefs],
      initialMarking: definition.net.initialMarking,
    },
    guards,
    executors,
    initialContext: definition.initialContext,
    terminalPlaces,
    invariants: definition.invariants,
  };
}

/**
 * Returns a new marking with additional tokens injected into a place.
 * Useful when expanding a net where some prerequisites are already satisfied.
 */
export function injectTokens<Place extends string>(
  marking: Marking<Place>,
  place: Place,
  count: number = 1,
): Marking<Place> {
  const newMarking = { ...marking };
  newMarking[place] = ((newMarking[place] ?? 0) + count) as Marking<Place>[Place];
  return newMarking;
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
