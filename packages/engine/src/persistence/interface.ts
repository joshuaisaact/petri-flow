import type { ExtendedInstanceState } from "./sqlite-adapter.js";

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
}
