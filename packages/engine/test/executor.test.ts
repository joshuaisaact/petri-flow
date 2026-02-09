import { describe, it, expect } from "bun:test";
import { defineWorkflow } from "../src/workflow.js";
import { createExecutor } from "../src/executor.js";
import type { DecisionProvider } from "../src/decision.js";

type Place = "start" | "middle" | "end";
type Ctx = { log: string[] };

const definition = defineWorkflow<Place, Ctx>({
  name: "exec-test",
  places: ["start", "middle", "end"],
  transitions: [
    {
      name: "begin",
      inputs: ["start"],
      outputs: ["middle"],
      guard: null,
      execute: async (ctx) => ({ log: [...ctx.log, "began"] }),
    },
    {
      name: "finish",
      inputs: ["middle"],
      outputs: ["end"],
      guard: null,
      execute: async (ctx) => ({ log: [...ctx.log, "finished"] }),
    },
  ],
  initialMarking: { start: 1, middle: 0, end: 0 },
  initialContext: { log: [] },
});

describe("createExecutor", () => {
  it("exposes name, initialMarking, initialContext from definition", () => {
    const executor = createExecutor(definition);
    expect(executor.name).toBe("exec-test");
    expect(executor.initialMarking).toEqual({ start: 1, middle: 0, end: 0 });
    expect(executor.initialContext).toEqual({ log: [] });
  });

  it("step() fires an enabled transition and returns fired result", async () => {
    const executor = createExecutor(definition);
    const result = await executor.step("inst-1", { start: 1, middle: 0, end: 0 }, { log: [] });

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transition).toBe("begin");
      expect(result.marking).toEqual({ start: 0, middle: 1, end: 0 });
      expect(result.context.log).toEqual(["began"]);
      expect(result.terminal).toBe(false);
    }
  });

  it("step() returns idle when no transitions are enabled", async () => {
    const executor = createExecutor(definition);
    const result = await executor.step("inst-1", { start: 0, middle: 0, end: 1 }, { log: [] });

    expect(result.kind).toBe("idle");
  });

  it("step() sets terminal=true when firing leads to no enabled transitions", async () => {
    const executor = createExecutor(definition);
    const result = await executor.step("inst-1", { start: 0, middle: 1, end: 0 }, { log: ["began"] });

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transition).toBe("finish");
      expect(result.terminal).toBe(true);
      expect(result.marking).toEqual({ start: 0, middle: 0, end: 1 });
    }
  });

  it("step() propagates execute errors as throws", async () => {
    type EPlace = "a" | "b";
    type ECtx = Record<string, unknown>;

    const errorDef = defineWorkflow<EPlace, ECtx>({
      name: "error-exec",
      places: ["a", "b"],
      transitions: [
        {
          name: "explode",
          inputs: ["a"],
          outputs: ["b"],
          guard: null,
          execute: async () => { throw new Error("kaboom"); },
        },
      ],
      initialMarking: { a: 1, b: 0 },
      initialContext: {},
    });

    const executor = createExecutor(errorDef);
    await expect(executor.step("inst-1", { a: 1, b: 0 }, {})).rejects.toThrow("kaboom");
  });

  it("step() respects guards", async () => {
    type GPlace = "pending" | "approved" | "denied";
    type GCtx = { score: number };

    const gatedDef = defineWorkflow<GPlace, GCtx>({
      name: "gated-exec",
      places: ["pending", "approved", "denied"],
      transitions: [
        {
          name: "approve",
          inputs: ["pending"],
          outputs: ["approved"],
          guard: "score >= 80",
        },
        {
          name: "deny",
          inputs: ["pending"],
          outputs: ["denied"],
          guard: "score < 80",
        },
      ],
      initialMarking: { pending: 1, approved: 0, denied: 0 },
      initialContext: { score: 90 },
    });

    const executor = createExecutor(gatedDef);
    const result = await executor.step("inst-1", { pending: 1, approved: 0, denied: 0 }, { score: 90 });

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transition).toBe("approve");
    }
  });

  it("step() uses decision provider at choice points", async () => {
    type CPlace = "start" | "a" | "b";
    type CCtx = Record<string, unknown>;

    const choiceDef = defineWorkflow<CPlace, CCtx>({
      name: "choice-exec",
      places: ["start", "a", "b"],
      transitions: [
        { name: "go_a", inputs: ["start"], outputs: ["a"], guard: null },
        { name: "go_b", inputs: ["start"], outputs: ["b"], guard: null },
      ],
      initialMarking: { start: 1, a: 0, b: 0 },
      initialContext: {},
    });

    const provider: DecisionProvider<CPlace, CCtx> = {
      async choose(request) {
        expect(request.instanceId).toBe("inst-1");
        expect(request.enabled).toHaveLength(2);
        return { transition: "go_b", reasoning: "prefer b" };
      },
    };

    const executor = createExecutor(choiceDef, { decisionProvider: provider });
    const result = await executor.step("inst-1", { start: 1, a: 0, b: 0 }, {});

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transition).toBe("go_b");
      expect(result.decision).toEqual({
        reasoning: "prefer b",
        candidates: ["go_a", "go_b"],
      });
    }
  });

  it("step() falls back to first enabled when decision provider returns unknown transition", async () => {
    type CPlace = "start" | "a" | "b";
    type CCtx = Record<string, unknown>;

    const choiceDef = defineWorkflow<CPlace, CCtx>({
      name: "choice-fallback",
      places: ["start", "a", "b"],
      transitions: [
        { name: "go_a", inputs: ["start"], outputs: ["a"], guard: null },
        { name: "go_b", inputs: ["start"], outputs: ["b"], guard: null },
      ],
      initialMarking: { start: 1, a: 0, b: 0 },
      initialContext: {},
    });

    const provider: DecisionProvider<CPlace, CCtx> = {
      async choose() {
        return { transition: "go_nonexistent", reasoning: "bad choice" };
      },
    };

    const executor = createExecutor(choiceDef, { decisionProvider: provider });
    const result = await executor.step("inst-1", { start: 1, a: 0, b: 0 }, {});

    expect(result.kind).toBe("fired");
    if (result.kind === "fired") {
      expect(result.transition).toBe("go_a");
    }
  });
});
