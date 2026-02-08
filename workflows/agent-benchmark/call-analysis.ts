import type { WorkflowDefinition } from "@petriflow/engine";

export type FiringClass = "deterministic" | "llm_choice" | "human_choice";

export type ChoicePoint = {
  place: string;
  transitions: string[];
  class: "llm" | "human";
};

export type ClassifiedFiring = {
  transition: string;
  class: FiringClass;
  batchGroup?: number;
};

export type CallAnalysis = {
  choicePoints: ChoicePoint[];
  concurrentGroups: ChoicePoint[][];
  path: ClassifiedFiring[];
  petriflow: {
    llmCalls: number;
    batchedLlmCalls: number;
    humanDecisions: number;
    deterministicFirings: number;
  };
  react: {
    llmCalls: number;
  };
  reductionPercent: number;
  batchedReductionPercent: number;
};

/**
 * Analyses the LLM call topology of a workflow.
 *
 * For each place, counts how many transitions consume from it.
 * If exactly one: tokens there fire deterministically (no LLM call needed).
 * If multiple: it's a choice point — the LLM (or human) must decide.
 *
 * Concurrent batching: when a single transition produces tokens in multiple
 * choice points simultaneously, those choices are independent and can be
 * batched into a single LLM call ("which of these tools do you want?").
 *
 * In a ReAct loop, every step requires an LLM "what should I do next?" call.
 * PetriFlow only calls the LLM at genuine choice points, and batches
 * independent concurrent ones.
 */
export function analyseCalls<Place extends string, Ctx extends Record<string, unknown> = Record<string, unknown>>(
  definition: WorkflowDefinition<Place, Ctx>,
  options: {
    humanPlaces?: Place[];
    executionPath: string[];
  },
): CallAnalysis {
  const transitions = definition.net.transitions;
  const humanPlaces = new Set(options.humanPlaces ?? []);

  // Build: place → set of transitions that consume from it
  const consumers = new Map<string, Set<string>>();
  for (const t of transitions) {
    for (const p of t.inputs) {
      if (!consumers.has(p)) consumers.set(p, new Set());
      consumers.get(p)!.add(t.name);
    }
  }

  // Find choice points: places with multiple consumers
  const choicePoints: ChoicePoint[] = [];
  const choicePointByPlace = new Map<string, ChoicePoint>();
  for (const [place, names] of consumers) {
    if (names.size > 1) {
      const cp: ChoicePoint = {
        place,
        transitions: [...names],
        class: humanPlaces.has(place as Place) ? "human" : "llm",
      };
      choicePoints.push(cp);
      choicePointByPlace.set(place, cp);
    }
  }

  // Detect concurrent groups: transitions that produce tokens in multiple
  // LLM choice points simultaneously. These can batch into 1 LLM call.
  const concurrentGroups: ChoicePoint[][] = [];
  const groupedPlaces = new Set<string>();

  for (const t of transitions) {
    const choiceOutputs = t.outputs.filter((p) => {
      const cp = choicePointByPlace.get(p);
      return cp && cp.class === "llm";
    });
    if (choiceOutputs.length > 1) {
      const group = choiceOutputs.map((p) => choicePointByPlace.get(p)!);
      concurrentGroups.push(group);
      for (const p of choiceOutputs) groupedPlaces.add(p);
    }
  }

  // Map transition name → its firing class
  const transitionClass = new Map<string, FiringClass>();
  for (const cp of choicePoints) {
    const cls: FiringClass =
      cp.class === "human" ? "human_choice" : "llm_choice";
    for (const t of cp.transitions) {
      transitionClass.set(t, cls);
    }
  }

  // Map transition name → batch group index (for concurrent LLM choices)
  const transitionBatchGroup = new Map<string, number>();
  for (let gi = 0; gi < concurrentGroups.length; gi++) {
    for (const cp of concurrentGroups[gi]!) {
      for (const t of cp.transitions) {
        transitionBatchGroup.set(t, gi);
      }
    }
  }

  // Classify each step in the execution path
  const path: ClassifiedFiring[] = options.executionPath.map((name) => ({
    transition: name,
    class: transitionClass.get(name) ?? ("deterministic" as FiringClass),
    batchGroup: transitionBatchGroup.get(name),
  }));

  const llmCalls = path.filter((s) => s.class === "llm_choice").length;
  const humanDecisions = path.filter(
    (s) => s.class === "human_choice",
  ).length;
  const deterministicFirings = path.filter(
    (s) => s.class === "deterministic",
  ).length;

  // Batched LLM calls: count each concurrent group as 1 call
  const seenGroups = new Set<number>();
  let batchedLlmCalls = 0;
  for (const step of path) {
    if (step.class !== "llm_choice") continue;
    if (step.batchGroup !== undefined) {
      if (!seenGroups.has(step.batchGroup)) {
        seenGroups.add(step.batchGroup);
        batchedLlmCalls++;
      }
    } else {
      batchedLlmCalls++;
    }
  }

  // ReAct: every step is an LLM "what next?" call (except human decisions)
  const reactLlmCalls = path.length - humanDecisions;

  return {
    choicePoints,
    concurrentGroups,
    path,
    petriflow: { llmCalls, batchedLlmCalls, humanDecisions, deterministicFirings },
    react: { llmCalls: reactLlmCalls },
    reductionPercent:
      reactLlmCalls > 0
        ? Math.round(((reactLlmCalls - llmCalls) / reactLlmCalls) * 1000) / 10
        : 0,
    batchedReductionPercent:
      reactLlmCalls > 0
        ? Math.round(
            ((reactLlmCalls - batchedLlmCalls) / reactLlmCalls) * 1000,
          ) / 10
        : 0,
  };
}
