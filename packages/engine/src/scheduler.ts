import { Database } from "bun:sqlite";
import type { Marking } from "petri-ts";
import type {
  WorkflowDefinition,
  WorkflowStatus,
} from "./types.js";
import { enabledWorkflowTransitions, fireWorkflow } from "./engine.js";
import { sqliteAdapter } from "./persistence/sqlite-adapter.js";
import type { ExtendedInstanceState } from "./persistence/sqlite-adapter.js";

export type SchedulerOptions = {
  pollIntervalMs?: number;
  db: Database;
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

  constructor(
    definition: WorkflowDefinition<Place, Ctx>,
    options: SchedulerOptions,
    events: SchedulerEvents<Place, Ctx> = {},
  ) {
    this.definition = definition;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.adapter = sqliteAdapter<Place, Ctx>(options.db, definition.name);
    this.events = events;
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

        // Fire the first enabled transition
        const transition = enabled[0]!;
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
