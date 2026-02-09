import type { Marking } from "petri-ts";
import type { WorkflowExecutor } from "./executor.js";
import type { ExtendedInstanceState } from "./persistence/sqlite-adapter.js";
import type { WorkflowPersistence } from "./persistence/interface.js";

export type SchedulerOptions<
  Place extends string,
  Ctx extends Record<string, unknown>,
> = {
  adapter: WorkflowPersistence<Place, Ctx>;
  pollIntervalMs?: number;
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
  onTimeout?: (instanceId: string, transitionName: string, place: string) => void;
};

export class Scheduler<
  Place extends string,
  Ctx extends Record<string, unknown>,
> {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly pollIntervalMs: number;
  private readonly adapter: WorkflowPersistence<Place, Ctx>;
  private readonly executor: WorkflowExecutor<Place, Ctx>;
  private readonly events: SchedulerEvents<Place, Ctx>;

  constructor(
    executor: WorkflowExecutor<Place, Ctx>,
    options: SchedulerOptions<Place, Ctx>,
    events: SchedulerEvents<Place, Ctx> = {},
  ) {
    this.executor = executor;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.adapter = options.adapter;
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
        let state = await this.adapter.loadExtended(id);

        try {
          // Phase 1: Handle expired timeouts
          const expired = await this.adapter.getExpiredTimeouts(id, Date.now());
          const preCandidates = this.executor.getTimeoutCandidates(state.marking);
          const enabledSet = new Set(preCandidates.map((c) => c.transitionName));

          for (const entry of expired) {
            if (enabledSet.has(entry.transitionName)) {
              const place = entry.place as Place;
              state.marking = { ...state.marking };
              state.marking[place] = ((state.marking[place] ?? 0) + 1) as Marking<Place>[Place];
              this.events.onTimeout?.(id, entry.transitionName, entry.place);
            }
            await this.adapter.markTimeoutFired(entry.id);
          }
          if (expired.length > 0) {
            await this.adapter.saveExtended(id, state);
          }

          // Phase 2: Step (same as before)
          const result = await this.executor.step(
            id,
            state.marking,
            state.context,
          );

          // Phase 3: Schedule/cancel timeouts based on new marking
          let postCandidates;
          if (result.kind === "fired") {
            await this.adapter.clearTimeouts(id, result.transition);
            postCandidates = this.executor.getTimeoutCandidates(result.marking);
          } else {
            postCandidates = this.executor.getTimeoutCandidates(state.marking);
          }

          // Cancel entries for transitions that lost enablement
          const postNames = new Set(postCandidates.map((c) => c.transitionName));
          for (const pre of preCandidates) {
            if (!postNames.has(pre.transitionName)) {
              await this.adapter.clearTimeouts(id, pre.transitionName);
            }
          }

          // Schedule new timeouts
          const now = Date.now();
          for (const candidate of postCandidates) {
            await this.adapter.scheduleTimeout({
              id: `${id}:${candidate.transitionName}:${now}`,
              instanceId: id,
              transitionName: candidate.transitionName,
              place: candidate.place,
              fireAt: now + candidate.ms,
            });
          }

          // Phase 4: Handle step result
          if (result.kind === "idle") {
            const hasPending = await this.adapter.hasPendingTimeouts(id);
            if (!hasPending) {
              await this.adapter.saveExtended(id, {
                ...state,
                status: "completed",
              });
              this.events.onComplete?.(id);
            }
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

  async injectToken(id: string, place: Place, count: number = 1): Promise<void> {
    const state = await this.adapter.loadExtended(id);
    const marking = { ...state.marking };
    marking[place] = ((marking[place] ?? 0) + count) as Marking<Place>[Place];
    await this.adapter.saveExtended(id, {
      ...state,
      marking,
      status: "active",
    });
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
