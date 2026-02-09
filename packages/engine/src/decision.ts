import type { Marking } from "petri-ts";

export type DecisionRequest<
  Place extends string,
  Ctx extends Record<string, unknown>,
> = {
  instanceId: string;
  workflowName: string;
  enabled: { name: string; inputs: string[]; outputs: string[] }[];
  marking: Marking<Place>;
  context: Ctx;
};

export type DecisionResult = {
  transition: string;
  reasoning: string;
};

export type DecisionProvider<
  Place extends string,
  Ctx extends Record<string, unknown>,
> = {
  choose(request: DecisionRequest<Place, Ctx>): Promise<DecisionResult>;
};
