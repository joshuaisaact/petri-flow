import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { defineWorkflow } from "@petriflow/engine/workflow";
import { WorkflowRuntime, type RuntimeEvent } from "../src/runtime.js";

// Simple inline workflow for tests — no file imports needed
const coffeeDefinition = defineWorkflow<string, Record<string, unknown>>({
  name: "coffee",
  places: [
    "waterCold",
    "waterHot",
    "beansWhole",
    "beansGround",
    "cupEmpty",
    "coffeeReady",
  ] as const,
  transitions: [
    {
      name: "heatWater",
      type: "script",
      inputs: ["waterCold"],
      outputs: ["waterHot"],
      guard: null,
      execute: async () => ({ waterTemp: 96 }),
    },
    {
      name: "grindBeans",
      type: "script",
      inputs: ["beansWhole"],
      outputs: ["beansGround"],
      guard: null,
      execute: async () => ({ grindSize: "medium" }),
    },
    {
      name: "pourOver",
      type: "script",
      inputs: ["waterHot", "beansGround", "cupEmpty"],
      outputs: ["coffeeReady"],
      guard: "waterTemp >= 90",
      execute: async () => ({ brewed: true }),
    },
  ],
  initialMarking: {
    waterCold: 1,
    waterHot: 0,
    beansWhole: 1,
    beansGround: 0,
    cupEmpty: 1,
    coffeeReady: 0,
  },
  initialContext: { waterTemp: 20, grindSize: "none", brewed: false },
  terminalPlaces: ["coffeeReady"],
});

const simpleDefinition = defineWorkflow({
  name: "simple",
  places: ["start", "end"] as const,
  transitions: [
    { name: "go", type: "automatic", inputs: ["start"], outputs: ["end"], guard: null },
  ],
  initialMarking: { start: 1, end: 0 },
  initialContext: {},
  terminalPlaces: ["end"],
});

let db: Database;
let runtime: WorkflowRuntime;

beforeEach(() => {
  db = new Database(":memory:");
  runtime = new WorkflowRuntime({ db });
});

afterEach(() => {
  runtime.stop();
  db.close();
});

describe("WorkflowRuntime", () => {
  describe("register", () => {
    it("registers a workflow", () => {
      runtime.register(coffeeDefinition);
      const workflows = runtime.listWorkflows();
      expect(workflows).toHaveLength(1);
      expect(workflows[0]!.name).toBe("coffee");
      expect(workflows[0]!.transitions).toContain("heatWater");
    });

    it("rejects duplicate registration", () => {
      runtime.register(coffeeDefinition);
      expect(() => runtime.register(coffeeDefinition)).toThrow(
        "Workflow already registered",
      );
    });

    it("registers multiple workflows", () => {
      runtime.register(coffeeDefinition);
      runtime.register(simpleDefinition);
      expect(runtime.listWorkflows()).toHaveLength(2);
    });
  });

  describe("createInstance", () => {
    it("creates an instance and returns initial marking", async () => {
      runtime.register(coffeeDefinition);
      const marking = await runtime.createInstance("coffee", "brew-1");
      expect(marking.waterCold).toBe(1);
      expect(marking.coffeeReady).toBe(0);
    });

    it("rejects unknown workflow", async () => {
      await expect(
        runtime.createInstance("nonexistent", "x"),
      ).rejects.toThrow("Unknown workflow");
    });
  });

  describe("inspect", () => {
    it("returns instance state", async () => {
      runtime.register(coffeeDefinition);
      await runtime.createInstance("coffee", "brew-1");
      const state = await runtime.inspect("brew-1");
      expect(state.workflowName).toBe("coffee");
      expect(state.status).toBe("active");
      expect(state.marking.waterCold).toBe(1);
    });

    it("rejects unknown instance", async () => {
      runtime.register(coffeeDefinition);
      await expect(runtime.inspect("nonexistent")).rejects.toThrow(
        "Instance not found",
      );
    });
  });

  describe("tick", () => {
    it("fires transitions across workflows", async () => {
      runtime.register(coffeeDefinition);
      runtime.register(simpleDefinition);
      await runtime.createInstance("coffee", "brew-1");
      await runtime.createInstance("simple", "s-1");

      const fired = await runtime.tick();
      // coffee: heatWater + grindBeans (parallel), simple: go
      expect(fired).toBeGreaterThanOrEqual(2);
    });

    it("completes a workflow", async () => {
      runtime.register(simpleDefinition);
      await runtime.createInstance("simple", "s-1");

      await runtime.tick(); // fires "go"
      const state = await runtime.inspect("s-1");
      expect(state.status).toBe("completed");
      expect(state.marking.end).toBe(1);
    });

    it("runs coffee workflow to completion", async () => {
      runtime.register(coffeeDefinition);
      await runtime.createInstance("coffee", "brew-1");

      for (let i = 0; i < 10; i++) {
        const n = await runtime.tick();
        if (n === 0) break;
      }

      const state = await runtime.inspect("brew-1");
      expect(state.status).toBe("completed");
      expect(state.marking.coffeeReady).toBe(1);
    });
  });

  describe("injectToken", () => {
    it("injects a token into an instance", async () => {
      runtime.register(simpleDefinition);
      await runtime.createInstance("simple", "s-1");

      // Fire the only transition to complete
      await runtime.tick();
      // Now inject token back into "start"
      await runtime.injectToken("s-1", "start");

      const state = await runtime.inspect("s-1");
      expect(state.marking.start).toBe(1);
      expect(state.status).toBe("active");
    });

    it("rejects unknown instance", async () => {
      runtime.register(simpleDefinition);
      await expect(
        runtime.injectToken("nonexistent", "start"),
      ).rejects.toThrow("Instance not found");
    });
  });

  describe("listInstances", () => {
    it("lists all instances", async () => {
      runtime.register(coffeeDefinition);
      runtime.register(simpleDefinition);
      await runtime.createInstance("coffee", "brew-1");
      await runtime.createInstance("simple", "s-1");

      const instances = await runtime.listInstances();
      expect(instances).toHaveLength(2);
    });

    it("filters by workflow", async () => {
      runtime.register(coffeeDefinition);
      runtime.register(simpleDefinition);
      await runtime.createInstance("coffee", "brew-1");
      await runtime.createInstance("simple", "s-1");

      const instances = await runtime.listInstances("coffee");
      expect(instances).toHaveLength(1);
      expect(instances[0]!.workflowName).toBe("coffee");
    });

    it("filters by status", async () => {
      runtime.register(simpleDefinition);
      await runtime.createInstance("simple", "s-1");
      await runtime.createInstance("simple", "s-2");
      await runtime.tick(); // completes both

      const active = await runtime.listInstances(undefined, "active");
      expect(active).toHaveLength(0);

      const completed = await runtime.listInstances(undefined, "completed");
      expect(completed).toHaveLength(2);
    });
  });

  describe("createInstance duplicate rejection", () => {
    it("rejects duplicate instance IDs", async () => {
      runtime.register(simpleDefinition);
      await runtime.createInstance("simple", "s-1");
      await expect(runtime.createInstance("simple", "s-1")).rejects.toThrow(
        "Instance already exists",
      );
    });
  });

  describe("getHistory", () => {
    it("returns transition history for an instance", async () => {
      runtime.register(simpleDefinition);
      await runtime.createInstance("simple", "s-1");
      await runtime.tick();

      const history = await runtime.getHistory("s-1");
      expect(history).toHaveLength(1);
      expect(history[0]!.transitionName).toBe("go");
      expect(history[0]!.markingBefore.start).toBe(1);
      expect(history[0]!.markingAfter.end).toBe(1);
    });

    it("rejects unknown instance", async () => {
      runtime.register(simpleDefinition);
      await expect(runtime.getHistory("nonexistent")).rejects.toThrow(
        "Instance not found",
      );
    });
  });

  describe("subscribe", () => {
    it("receives fire events", async () => {
      runtime.register(simpleDefinition);
      const events: RuntimeEvent[] = [];
      runtime.subscribe((e) => events.push(e));

      await runtime.createInstance("simple", "s-1");
      await runtime.tick();

      const fireEvents = events.filter((e) => e.type === "fire");
      expect(fireEvents).toHaveLength(1);
      expect(fireEvents[0]!.workflow).toBe("simple");
      expect(fireEvents[0]!.instanceId).toBe("s-1");
    });

    it("receives complete events", async () => {
      runtime.register(simpleDefinition);
      const events: RuntimeEvent[] = [];
      runtime.subscribe((e) => events.push(e));

      await runtime.createInstance("simple", "s-1");
      await runtime.tick();

      const completeEvents = events.filter((e) => e.type === "complete");
      expect(completeEvents).toHaveLength(1);
    });

    it("unsubscribe stops delivery", async () => {
      runtime.register(simpleDefinition);
      const events: RuntimeEvent[] = [];
      const unsub = runtime.subscribe((e) => events.push(e));

      await runtime.createInstance("simple", "s-1");
      unsub();
      await runtime.tick();

      expect(events).toHaveLength(0);
    });

    it("includes workflow name in events", async () => {
      runtime.register(coffeeDefinition);
      const events: RuntimeEvent[] = [];
      runtime.subscribe((e) => events.push(e));

      await runtime.createInstance("coffee", "brew-1");
      await runtime.tick();

      for (const event of events) {
        expect(event.workflow).toBe("coffee");
      }
    });
  });

  describe("saveDefinition", () => {
    it("persists and registers a workflow from JSON", async () => {
      const serialized = {
        name: "dynamic",
        places: ["a", "b"],
        transitions: [{ name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null }],
        initialMarking: { a: 1, b: 0 },
        initialContext: {},
        terminalPlaces: ["b"],
      };

      runtime.saveDefinition(serialized);

      // Registered — can create instances
      await runtime.createInstance("dynamic", "d-1");
      await runtime.tick();
      const state = await runtime.inspect("d-1");
      expect(state.marking.b).toBe(1);
      expect(state.status).toBe("completed");
    });

    it("validates the definition before saving", () => {
      expect(() =>
        runtime.saveDefinition({
          name: "bad",
          places: ["a"],
          transitions: [{ name: "t", type: "automatic", inputs: ["a"], outputs: ["z"], guard: null }],
          initialMarking: { a: 1 },
          initialContext: {},
          terminalPlaces: [],
        }),
      ).toThrow("unknown output place");
    });

    it("re-registers on update", async () => {
      const v1 = {
        name: "evolving",
        places: ["a", "b"],
        transitions: [{ name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null }],
        initialMarking: { a: 1, b: 0 },
        initialContext: {},
        terminalPlaces: ["b"],
      };

      runtime.saveDefinition(v1);

      const v2 = {
        ...v1,
        places: ["a", "b", "c"],
        transitions: [
          { name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null },
          { name: "continue", type: "automatic", inputs: ["b"], outputs: ["c"], guard: null },
        ],
        initialMarking: { a: 1, b: 0, c: 0 },
        terminalPlaces: ["c"],
      };

      runtime.saveDefinition(v2);

      // New version is active
      await runtime.createInstance("evolving", "e-1");
      await runtime.tick();
      await runtime.tick();
      const state = await runtime.inspect("e-1");
      expect(state.marking.c).toBe(1);
    });
  });

  describe("saveDefinition with node executors", () => {
    it("compiles http node from type + config and executes on tick", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = Object.assign(
        mock(async () => new Response(
          JSON.stringify({ result: "ok" }),
          { headers: { "content-type": "application/json" } },
        )),
        { preconnect() {} },
      ) as unknown as typeof fetch;

      try {
        runtime.saveDefinition({
          name: "http-workflow",
          places: ["start", "done"],
          transitions: [
            {
              name: "call_api",
              type: "http",
              inputs: ["start"],
              outputs: ["done"],
              guard: null,
              config: { url: "http://mock-server/api", method: "POST", body: { key: "value" } },
            },
          ],
          initialMarking: { start: 1, done: 0 },
          initialContext: {},
          terminalPlaces: ["done"],
        });

        await runtime.createInstance("http-workflow", "http-1");
        await runtime.tick();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const state = await runtime.inspect("http-1");
        expect(state.marking.done).toBe(1);
        expect(state.status).toBe("completed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("loadDefinition", () => {
    it("returns saved definition", () => {
      runtime.saveDefinition({
        name: "loadable",
        places: ["x"],
        transitions: [],
        initialMarking: { x: 1 },
        initialContext: { key: "value" },
        terminalPlaces: [],
      });

      const loaded = runtime.loadDefinition("loadable");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("loadable");
      expect(loaded!.initialContext).toEqual({ key: "value" });
    });

    it("returns null for missing definition", () => {
      expect(runtime.loadDefinition("nonexistent")).toBeNull();
    });
  });

  describe("deleteDefinition", () => {
    it("removes definition and unregisters workflow", () => {
      runtime.saveDefinition({
        name: "deletable",
        places: ["a"],
        transitions: [],
        initialMarking: { a: 1 },
        initialContext: {},
        terminalPlaces: [],
      });

      expect(runtime.deleteDefinition("deletable")).toBe(true);
      expect(runtime.loadDefinition("deletable")).toBeNull();

      // Unregistered — not in workflow list
      const names = runtime.listWorkflows().map((w) => w.name);
      expect(names).not.toContain("deletable");
    });

    it("returns false for missing definition", () => {
      expect(runtime.deleteDefinition("nonexistent")).toBe(false);
    });
  });
});
