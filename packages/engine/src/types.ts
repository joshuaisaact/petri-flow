import type { Transition, PetriNet, Marking } from "petri-ts";

export type GuardFn<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = (ctx: Ctx, marking: Marking<Place>) => boolean;

/**
 * Extends petri-ts Transition with optional guard, execute, and timeout.
 * Because this is an intersection, a WorkflowTransition IS a Transition
 * and passes directly to all petri-ts analysis functions.
 */
export type WorkflowTransition<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = Transition<Place> & {
  guard: string | null;
  execute?: (ctx: Ctx, marking: Marking<Place>) => Promise<Partial<Ctx>>;
  timeout?: { place: Place; ms: number };
};

export type WorkflowNet<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = {
  transitions: WorkflowTransition<Place, Ctx>[];
  initialMarking: Marking<Place>;
};

export type WorkflowStatus =
  | "active"
  | "completed"
  | "failed"
  | "suspended";

export type WorkflowDefinition<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: string;
  net: WorkflowNet<Place, Ctx>;
  guards: Map<string, GuardFn<Place, Ctx>>;
  initialContext: Ctx;
  terminalPlaces: Place[];
  invariants?: { weights: Partial<Record<Place, number>> }[];
};

export type ExecutionResult<
  Place extends string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = {
  marking: Marking<Place>;
  context: Ctx;
  firedTransition: string;
};
