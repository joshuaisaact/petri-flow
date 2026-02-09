import { Database } from "bun:sqlite";
import type { Marking } from "petri-ts";
import type { WorkflowExecutor } from "./executor.js";
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
  private readonly executor: WorkflowExecutor<Place, Ctx>;
  private readonly events: SchedulerEvents<Place, Ctx>;

  constructor(
    executor: WorkflowExecutor<Place, Ctx>,
    options: SchedulerOptions,
    events: SchedulerEvents<Place, Ctx> = {},
  ) {
    this.executor = executor;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.adapter = sqliteAdapter<Place, Ctx>(options.db, executor.name);
    this.events = events;
  }

  async createInstance(id: string): Promise<Marking<Place>> {
    await this.adapter.saveExtended(id, {
      marking: this.executor.initialMarking,
      workflowName: this.executor.name,
      context: this.executor.initialContext,
      status: "active",
    });
    return this.executor.initialMarking;
  }

  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let totalFired = 0;

    try {
      const activeIds = await this.adapter.listActive();

      for (const id of activeIds) {
        const state = await this.adapter.loadExtended(id);

        try {
          const result = await this.executor.step(
            id,
            state.marking,
            state.context,
          );

          if (result.kind === "idle") {
            await this.adapter.saveExtended(id, {
              ...state,
              status: "completed",
            });
            this.events.onComplete?.(id);
            continue;
          }

          if (result.decision) {
            this.events.onDecision?.(
              id,
              result.transition,
              result.decision.reasoning,
              result.decision.candidates,
            );
          }

          const status = result.terminal ? "completed" : "active";
          await this.adapter.saveExtended(id, {
            marking: result.marking,
            workflowName: state.workflowName,
            context: result.context,
            status,
          });

          this.events.onFire?.(id, result.transition, {
            marking: result.marking,
            context: result.context,
          });
          totalFired++;

          if (result.terminal) {
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
