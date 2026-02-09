import { canFire, fire, enabledTransitions } from "petri-ts";
import type { Marking } from "petri-ts";
import type {
  WorkflowTransition,
  WorkflowNet,
  ExecutionResult,
} from "./types.js";

/**
 * Check if a workflow transition can fire: structural (petri-ts canFire)
 * AND guard function (if present).
 */
export function canFireWorkflow<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(
  marking: Marking<Place>,
  transition: WorkflowTransition<Place, Ctx>,
  ctx: Ctx,
): boolean {
  if (!canFire(marking, transition)) return false;
  if (transition.compiledGuard && !transition.compiledGuard(ctx, marking)) return false;
  return true;
}

/**
 * Returns all workflow transitions that are both structurally enabled
 * AND pass their guard functions.
 */
export function enabledWorkflowTransitions<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(
  net: WorkflowNet<Place, Ctx>,
  marking: Marking<Place>,
  ctx: Ctx,
): WorkflowTransition<Place, Ctx>[] {
  // First get structurally enabled transitions from petri-ts
  const structurallyEnabled = enabledTransitions(net, marking);
  const enabledNames = new Set(structurallyEnabled.map((t) => t.name));

  // Then filter by guard
  return net.transitions.filter(
    (t) => enabledNames.has(t.name) && canFireWorkflow(marking, t, ctx),
  );
}

/**
 * Fire a workflow transition: fire the petri net transition, then
 * execute the side effect (if any), merging context updates.
 */
export async function fireWorkflow<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(
  marking: Marking<Place>,
  transition: WorkflowTransition<Place, Ctx>,
  ctx: Ctx,
): Promise<ExecutionResult<Place, Ctx>> {
  if (!canFireWorkflow(marking, transition, ctx)) {
    throw new Error(`Cannot fire workflow transition: ${transition.name}`);
  }

  const newMarking = fire(marking, transition);

  let newCtx = ctx;
  if (transition.execute) {
    const patch = await transition.execute(ctx, marking);
    newCtx = { ...ctx, ...patch };
  }

  return {
    marking: newMarking,
    context: newCtx,
    firedTransition: transition.name,
  };
}
