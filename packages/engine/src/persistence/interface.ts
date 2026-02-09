import type { ExtendedInstanceState } from "./sqlite-adapter.js";

export type TimeoutEntry = {
  id: string;
  instanceId: string;
  transitionName: string;
  place: string;
  fireAt: number;
};

export interface WorkflowPersistence<
  Place extends string,
  Ctx extends Record<string, unknown>,
> {
  loadExtended(id: string): Promise<ExtendedInstanceState<Place, Ctx>>;
  saveExtended(
    id: string,
    state: ExtendedInstanceState<Place, Ctx>,
  ): Promise<void>;
  listActive(): Promise<string[]>;

  scheduleTimeout(entry: TimeoutEntry): Promise<void>;
  getExpiredTimeouts(instanceId: string, now: number): Promise<TimeoutEntry[]>;
  markTimeoutFired(id: string): Promise<void>;
  clearTimeouts(instanceId: string, transitionName?: string): Promise<void>;
  hasPendingTimeouts(instanceId: string): Promise<boolean>;
}
