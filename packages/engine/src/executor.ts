import { canFire, type Marking } from "petri-ts";
import type { WorkflowDefinition, WorkflowTransition } from "./types.js";
import type { DecisionProvider } from "./decision.js";
import { enabledWorkflowTransitions, fireWorkflow } from "./engine.js";

export type StepResult<
  Place extends string,
  Ctx extends Record<string, unknown>,
> =
  | {
      kind: "fired";
      marking: Marking<Place>;
      context: Ctx;
      transition: string;
      terminal: boolean;
      decision?: { reasoning: string; candidates: string[] };
    }
  | { kind: "idle" };

export type TimeoutCandidate<Place extends string> = {
  transitionName: string;
  place: Place;
  ms: number;
};

export interface WorkflowExecutor<
  Place extends string,
  Ctx extends Record<string, unknown>,
> {
  readonly name: string;
  readonly initialMarking: Marking<Place>;
  readonly initialContext: Ctx;
  step(
    instanceId: string,
    marking: Marking<Place>,
    ctx: Ctx,
  ): Promise<StepResult<Place, Ctx>>;
  getTimeoutCandidates(marking: Marking<Place>): TimeoutCandidate<Place>[];
}

export function createExecutor<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(
  definition: WorkflowDefinition<Place, Ctx>,
  options?: { decisionProvider?: DecisionProvider<Place, Ctx> },
): WorkflowExecutor<Place, Ctx> {
  const decisionProvider = options?.decisionProvider;

  return {
    name: definition.name,
    initialMarking: definition.net.initialMarking,
    initialContext: definition.initialContext,

    getTimeoutCandidates(marking: Marking<Place>): TimeoutCandidate<Place>[] {
      return definition.net.transitions
        .filter((t) => t.timeout && canFire(marking, t))
        .map((t) => ({
          transitionName: t.name,
          place: t.timeout!.place,
          ms: t.timeout!.ms,
        }));
    },

    async step(
      instanceId: string,
      marking: Marking<Place>,
      ctx: Ctx,
    ): Promise<StepResult<Place, Ctx>> {
      const enabled = enabledWorkflowTransitions(
        definition.net,
        marking,
        ctx,
        definition.guards,
      );

      if (enabled.length === 0) {
        return { kind: "idle" };
      }

      let transition: WorkflowTransition<Place, Ctx>;
      let decision: { reasoning: string; candidates: string[] } | undefined;

      if (enabled.length === 1 || !decisionProvider) {
        transition = enabled[0]!;
      } else {
        const result = await decisionProvider.choose({
          instanceId,
          workflowName: definition.name,
          enabled: enabled.map((t) => ({
            name: t.name,
            inputs: [...t.inputs],
            outputs: [...t.outputs],
          })),
          marking,
          context: ctx,
        });
        transition =
          enabled.find((t) => t.name === result.transition) ?? enabled[0]!;
        decision = {
          reasoning: result.reasoning,
          candidates: enabled.map((t) => t.name),
        };
      }

      const result = await fireWorkflow(marking, transition, ctx, definition.guards, definition.executors);

      const nextEnabled = enabledWorkflowTransitions(
        definition.net,
        result.marking,
        result.context,
        definition.guards,
      );

      return {
        kind: "fired",
        marking: result.marking,
        context: result.context,
        transition: result.firedTransition,
        terminal: nextEnabled.length === 0,
        decision,
      };
    },
  };
}
