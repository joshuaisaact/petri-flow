import { describe, it, expect } from "bun:test";
import {
  canFireWorkflow,
  enabledWorkflowTransitions,
  fireWorkflow,
} from "../src/engine.js";
import { defineWorkflow } from "../src/workflow.js";
import type { WorkflowNet } from "../src/types.js";
import type { Marking } from "petri-ts";

type Place = "idle" | "review" | "approved" | "rejected";
type Ctx = { amount: number; approved: boolean };

const def = defineWorkflow<Place, Ctx>({
  name: "engine-test",
  places: ["idle", "review", "approved", "rejected"],
  transitions: [
    {
      name: "submit",
      inputs: ["idle"],
      outputs: ["review"],
      guard: null,
    },
    {
      name: "approve",
      inputs: ["review"],
      outputs: ["approved"],
      guard: "amount < 10000",
      execute: async (ctx) => ({ approved: true }),
    },
    {
      name: "reject",
      inputs: ["review"],
      outputs: ["rejected"],
      guard: "amount >= 10000",
    },
  ],
  initialMarking: { idle: 1, review: 0, approved: 0, rejected: 0 },
  initialContext: { amount: 0, approved: false },
  terminalPlaces: ["approved", "rejected"],
});

const transitions = def.net.transitions;
const net = def.net;

describe("canFireWorkflow", () => {
  it("returns true when structurally enabled and guard passes", () => {
    const marking: Marking<Place> = { idle: 0, review: 1, approved: 0, rejected: 0 };
    expect(canFireWorkflow(marking, transitions[1]!, { amount: 5000, approved: false })).toBe(true);
  });

  it("returns false when guard fails", () => {
    const marking: Marking<Place> = { idle: 0, review: 1, approved: 0, rejected: 0 };
    expect(canFireWorkflow(marking, transitions[1]!, { amount: 15000, approved: false })).toBe(false);
  });

  it("returns false when structurally disabled", () => {
    const marking: Marking<Place> = { idle: 1, review: 0, approved: 0, rejected: 0 };
    expect(canFireWorkflow(marking, transitions[1]!, { amount: 5000, approved: false })).toBe(false);
  });

  it("returns true with no guard", () => {
    const marking: Marking<Place> = { idle: 1, review: 0, approved: 0, rejected: 0 };
    expect(canFireWorkflow(marking, transitions[0]!, { amount: 5000, approved: false })).toBe(true);
  });
});

describe("enabledWorkflowTransitions", () => {
  it("returns only guard-passing transitions", () => {
    const marking: Marking<Place> = { idle: 0, review: 1, approved: 0, rejected: 0 };
    const lowAmount = enabledWorkflowTransitions(net, marking, { amount: 5000, approved: false });
    expect(lowAmount.map((t) => t.name)).toEqual(["approve"]);

    const highAmount = enabledWorkflowTransitions(net, marking, { amount: 15000, approved: false });
    expect(highAmount.map((t) => t.name)).toEqual(["reject"]);
  });
});

describe("fireWorkflow", () => {
  it("fires and executes side effect, merging context", async () => {
    const marking: Marking<Place> = { idle: 0, review: 1, approved: 0, rejected: 0 };
    const result = await fireWorkflow(marking, transitions[1]!, { amount: 5000, approved: false });

    expect(result.marking).toEqual({ idle: 0, review: 0, approved: 1, rejected: 0 });
    expect(result.context.approved).toBe(true);
    expect(result.firedTransition).toBe("approve");
  });

  it("fires without execute (no context change)", async () => {
    const marking: Marking<Place> = { idle: 1, review: 0, approved: 0, rejected: 0 };
    const ctx = { amount: 5000, approved: false };
    const result = await fireWorkflow(marking, transitions[0]!, ctx);

    expect(result.marking).toEqual({ idle: 0, review: 1, approved: 0, rejected: 0 });
    expect(result.context).toEqual(ctx);
    expect(result.firedTransition).toBe("submit");
  });

  it("throws when transition cannot fire", async () => {
    const marking: Marking<Place> = { idle: 1, review: 0, approved: 0, rejected: 0 };
    expect(
      fireWorkflow(marking, transitions[1]!, { amount: 5000, approved: false }),
    ).rejects.toThrow("Cannot fire workflow transition: approve");
  });
});
