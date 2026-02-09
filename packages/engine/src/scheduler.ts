import { Database } from "bun:sqlite";
import type { Marking } from "petri-ts";
import type {
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowTransition,
} from "./types.js";
import type { DecisionProvider } from "./decision.js";
import { enabledWorkflowTransitions, fireWorkflow } from "./engine.js";
import { sqliteAdapter } from "./persistence/sqlite-adapter.js";
import type { ExtendedInstanceState } from "./persistence/sqlite-adapter.js";

export type SchedulerOptions<
  Place extends string = string,
  Ctx extends Record<string, unknown> = Record<string, unknown>,
> = {
  pollIntervalMs?: number;
  db: Database;
  decisionProvider?: DecisionProvider<Place, Ctx>;
};

export type SchedulerEvents<
  Place extends string,
  Ctx extends Record<string, unknown>,
> = {
  onFire?: (
    instanceId: string,
    transitionName: string,
    result: { marking: Marking<Place>; context: Ctx },
  ) => void;
  onDecision?: (
    instanceId: string,
    transitionName: string,
    reasoning: string,
    candidates: string[],
  ) => void;
  onComplete?: (instanceId: string) => void;
  onError?: (instanceId: string, error: unknown) => void;
};

export class Scheduler<
  Place extends string,
  Ctx extends Record<string, unknown>,
> {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly pollIntervalMs: number;
  private readonly adapter: ReturnType<typeof sqliteAdapter<Place, Ctx>>;
  private readonly definition: WorkflowDefinition<Place, Ctx>;
  private readonly events: SchedulerEvents<Place, Ctx>;
  private readonly decisionProvider?: DecisionProvider<Place, Ctx>;

  constructor(
    definition: WorkflowDefinition<Place, Ctx>,
    options: SchedulerOptions<Place, Ctx>,
    events: SchedulerEvents<Place, Ctx> = {},
  ) {
    this.definition = definition;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.adapter = sqliteAdapter<Place, Ctx>(options.db, definition.name);
    this.events = events;
    this.decisionProvider = options.decisionProvider;
  }

  async createInstance(id: string): Promise<Marking<Place>> {
    await this.adapter.saveExtended(id, {
      marking: this.definition.net.initialMarking,
      workflowName: this.definition.name,
      context: this.definition.initialContext,
      status: "active",
    });
    return this.definition.net.initialMarking;
  }

  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let totalFired = 0;

    try {
      const activeIds = await this.adapter.listActive();

      for (const id of activeIds) {
        const state = await this.adapter.loadExtended(id);
        const enabled = enabledWorkflowTransitions(
          this.definition.net,
          state.marking,
          state.context,
        );

        if (enabled.length === 0) {
          // No transitions enabled — mark as completed
          await this.adapter.saveExtended(id, {
            ...state,
            status: "completed",
          });
          this.events.onComplete?.(id);
          continue;
        }

        // Choose transition: use decision provider at choice points, otherwise deterministic
        let transition: WorkflowTransition<Place, Ctx>;
        if (enabled.length === 1 || !this.decisionProvider) {
          transition = enabled[0]!;
        } else {
          const result = await this.decisionProvider.choose({
            instanceId: id,
            workflowName: this.definition.name,
            enabled: enabled.map(t => ({ name: t.name, inputs: [...t.inputs], outputs: [...t.outputs] })),
            marking: state.marking,
            context: state.context,
          });
          transition = enabled.find(t => t.name === result.transition) ?? enabled[0]!;
          this.events.onDecision?.(
            id,
            result.transition,
            result.reasoning,
            enabled.map(t => t.name),
          );
        }
        try {
          const result = await fireWorkflow(
            state.marking,
            transition,
            state.context,
          );

          await this.adapter.saveExtended(id, {
            marking: result.marking,
            workflowName: state.workflowName,
            context: result.context,
            status: "active",
          });

          this.events.onFire?.(id, result.firedTransition, {
            marking: result.marking,
            context: result.context,
          });
          totalFired++;

          // Check if we've reached a terminal state after firing
          const nextEnabled = enabledWorkflowTransitions(
            this.definition.net,
            result.marking,
            result.context,
          );
          if (nextEnabled.length === 0) {
            await this.adapter.saveExtended(id, {
              marking: result.marking,
              workflowName: state.workflowName,
              context: result.context,
              status: "completed",
            });
            this.events.onComplete?.(id);
          }
        } catch (err) {
          this.events.onError?.(id, err);
          try {
            await this.adapter.saveExtended(id, {
              ...state,
              status: "failed",
            });
          } catch (saveErr) {
            this.events.onError?.(id, saveErr);
          }
        }
      }
    } finally {
      this.ticking = false;
    }

    return totalFired;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async inspect(
    id: string,
  ): Promise<ExtendedInstanceState<Place, Ctx>> {
    return this.adapter.loadExtended(id);
  }
}
