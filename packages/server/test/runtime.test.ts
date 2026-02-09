import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { defineWorkflow } from "@petriflow/engine/workflow";
import { WorkflowRuntime, type RuntimeEvent } from "../src/runtime.js";

// Simple inline workflow for tests — no file imports needed
const coffeeDefinition = defineWorkflow({
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
      inputs: ["waterCold"],
      outputs: ["waterHot"],
      guard: null,
      execute: async () => ({ waterTemp: 96 }),
    },
    {
      name: "grindBeans",
      inputs: ["beansWhole"],
      outputs: ["beansGround"],
      guard: null,
      execute: async () => ({ grindSize: "medium" }),
    },
    {
      name: "pourOver",
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
    { name: "go", inputs: ["start"], outputs: ["end"], guard: null },
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
});
