import { canFire, fire, type Marking } from "petri-ts";
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

export type BatchStepResult<
  Place extends string,
  Ctx extends Record<string, unknown>,
> =
  | {
      kind: "fired";
      marking: Marking<Place>;
      context: Ctx;
      transitions: string[];
      terminal: boolean;
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
  stepBatch(
    instanceId: string,
    marking: Marking<Place>,
    ctx: Ctx,
    maxConcurrent: number,
  ): Promise<BatchStepResult<Place, Ctx>>;
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

    async stepBatch(
      instanceId: string,
      marking: Marking<Place>,
      ctx: Ctx,
      maxConcurrent: number,
    ): Promise<BatchStepResult<Place, Ctx>> {
      if (maxConcurrent < 1) {
        throw new Error("maxConcurrent must be >= 1");
      }

      const enabled = enabledWorkflowTransitions(
        definition.net,
        marking,
        ctx,
        definition.guards,
      );

      if (enabled.length === 0) {
        return { kind: "idle" };
      }

      // Greedily select non-conflicting transitions by tracking a working marking.
      // First-enabled wins: if two transitions compete for the same input tokens,
      // only the first one gets selected.
      const selected: WorkflowTransition<Place, Ctx>[] = [];
      let workingMarking = { ...marking } as Marking<Place>;

      for (const t of enabled) {
        if (selected.length >= maxConcurrent) break;
        if (canFire(workingMarking, t)) {
          // Reserve tokens by firing structurally (consume inputs, produce outputs)
          workingMarking = fire(workingMarking, t);
          selected.push(t);
        }
      }

      // Run all executors in parallel
      const executorPromises = selected.map(async (t) => {
        const executeFn = definition.executors.get(t.name);
        const patch = executeFn ? await executeFn(ctx, marking) : {};
        return { name: t.name, patch };
      });

      const results = await Promise.all(executorPromises);

      // Merge context patches in transition-name order (deterministic)
      const sorted = [...results].sort((a, b) => a.name.localeCompare(b.name));
      let mergedCtx = { ...ctx };
      for (const r of sorted) {
        mergedCtx = { ...mergedCtx, ...r.patch };
      }

      // workingMarking already reflects all fires
      const nextEnabled = enabledWorkflowTransitions(
        definition.net,
        workingMarking,
        mergedCtx,
        definition.guards,
      );

      return {
        kind: "fired",
        marking: workingMarking,
        context: mergedCtx,
        transitions: selected.map((t) => t.name),
        terminal: nextEnabled.length === 0,
      };
    },
  };
}
