import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { defineWorkflow } from "@petriflow/engine/workflow";
import { WorkflowRuntime } from "../src/runtime.js";
import { createServer } from "../src/http.js";
import type { Server } from "bun";

const simpleDefinition = defineWorkflow({
  name: "simple",
  places: ["start", "end"] as const,
  transitions: [{ name: "go", type: "automatic", inputs: ["start"], outputs: ["end"], guard: null }],
  initialMarking: { start: 1, end: 0 },
  initialContext: {},
  terminalPlaces: ["end"],
});

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

let db: Database;
let runtime: WorkflowRuntime;
let server: Server<undefined>;
let baseUrl: string;

beforeEach(() => {
  db = new Database(":memory:");
  runtime = new WorkflowRuntime({ db });
  runtime.register(simpleDefinition);
  runtime.register(coffeeDefinition);
  server = createServer({ runtime, port: 0 }); // random port
  baseUrl = `http://localhost:${server.port}`;
});

afterEach(() => {
  runtime.stop();
  server.stop();
  db.close();
});

describe("HTTP API", () => {
  describe("GET /workflows", () => {
    it("returns registered workflows", async () => {
      const res = await fetch(`${baseUrl}/workflows`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(2);
      const names = data.map((w: any) => w.name);
      expect(names).toContain("simple");
      expect(names).toContain("coffee");
    });
  });

  describe("POST /workflows/:name/instances", () => {
    it("creates an instance", async () => {
      const res = await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("s-1");
      expect(data.marking.start).toBe(1);
    });

    it("returns 400 for missing id", async () => {
      const res = await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown workflow", async () => {
      const res = await fetch(`${baseUrl}/workflows/nonexistent/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "x" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /workflows/:name/instances", () => {
    it("lists instances for a workflow", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-2" }),
      });

      const res = await fetch(`${baseUrl}/workflows/simple/instances`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(2);
    });
  });

  describe("GET /instances/:id", () => {
    it("returns instance state", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });

      const res = await fetch(`${baseUrl}/instances/s-1`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.workflowName).toBe("simple");
      expect(data.status).toBe("active");
      expect(data.marking.start).toBe(1);
    });

    it("returns 404 for unknown instance", async () => {
      const res = await fetch(`${baseUrl}/instances/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /instances/:id/history", () => {
    it("returns transition history", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });

      await runtime.tick();

      const res = await fetch(`${baseUrl}/instances/s-1/history`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].transitionName).toBe("go");
      expect(data[0].markingBefore.start).toBe(1);
      expect(data[0].markingAfter.end).toBe(1);
    });

    it("returns 404 for unknown instance", async () => {
      const res = await fetch(`${baseUrl}/instances/nonexistent/history`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /instances/:id/inject", () => {
    it("injects a token", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });

      // Complete it first
      await runtime.tick();

      const res = await fetch(`${baseUrl}/instances/s-1/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: "start", count: 1 }),
      });
      expect(res.status).toBe(200);

      const state = await fetch(`${baseUrl}/instances/s-1`);
      const data = await state.json();
      expect(data.marking.start).toBe(1);
      expect(data.status).toBe("active");
    });

    it("returns 400 for missing place", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });

      const res = await fetch(`${baseUrl}/instances/s-1/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /events (SSE)", () => {
    it("streams events", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });

      // Connect to SSE
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/events`, {
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Read the initial keepalive
      const { value: keepalive } = await reader.read();
      expect(decoder.decode(keepalive)).toContain(": connected");

      // Fire a tick to generate events
      await runtime.tick();

      // Read events
      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toContain("data:");

      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      const events = lines.map((l) => JSON.parse(l.slice(5)));
      const fireEvent = events.find((e: any) => e.type === "fire");
      expect(fireEvent).toBeDefined();
      expect(fireEvent.workflow).toBe("simple");

      controller.abort();
    });

    it("filters by workflow", async () => {
      await fetch(`${baseUrl}/workflows/simple/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "s-1" }),
      });
      await fetch(`${baseUrl}/workflows/coffee/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "brew-1" }),
      });

      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/events?workflow=simple`, {
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Skip keepalive
      await reader.read();

      await runtime.tick();

      const { value } = await reader.read();
      const text = decoder.decode(value);
      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      const events = lines.map((l) => JSON.parse(l.slice(5)));

      // Only simple workflow events
      for (const event of events) {
        expect(event.workflow).toBe("simple");
      }

      controller.abort();
    });
  });

  describe("PUT /definitions/:name", () => {
    it("saves and registers a definition", async () => {
      const def = {
        name: "dynamic",
        places: ["a", "b"],
        transitions: [{ name: "go", type: "automatic", inputs: ["a"], outputs: ["b"], guard: null }],
        initialMarking: { a: 1, b: 0 },
        initialContext: {},
        terminalPlaces: ["b"],
      };

      const res = await fetch(`${baseUrl}/definitions/dynamic`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.saved).toBe("dynamic");

      // Workflow is now registered — can create instances
      const createRes = await fetch(`${baseUrl}/workflows/dynamic/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "d-1" }),
      });
      expect(createRes.status).toBe(201);
    });

    it("returns 400 for name mismatch", async () => {
      const res = await fetch(`${baseUrl}/definitions/foo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bar", places: [], transitions: [], initialMarking: {}, initialContext: {}, terminalPlaces: [] }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("does not match");
    });

    it("returns 400 for invalid definition", async () => {
      const res = await fetch(`${baseUrl}/definitions/bad`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "bad",
          places: ["a"],
          transitions: [{ name: "t", inputs: ["a"], outputs: ["unknown"], guard: null }],
          initialMarking: { a: 1 },
          initialContext: {},
          terminalPlaces: [],
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("unknown output place");
    });
  });

  describe("GET /definitions/:name", () => {
    it("returns a saved definition", async () => {
      const def = {
        name: "stored",
        places: ["x", "y"],
        transitions: [{ name: "move", type: "automatic", inputs: ["x"], outputs: ["y"], guard: "ready" }],
        initialMarking: { x: 1, y: 0 },
        initialContext: { ready: true },
        terminalPlaces: ["y"],
      };

      await fetch(`${baseUrl}/definitions/stored`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });

      const res = await fetch(`${baseUrl}/definitions/stored`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("stored");
      expect(data.places).toEqual(["x", "y"]);
      expect(data.transitions[0].guard).toBe("ready");
    });

    it("returns 404 for missing definition", async () => {
      const res = await fetch(`${baseUrl}/definitions/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /definitions", () => {
    it("lists saved definitions", async () => {
      const def = {
        name: "listed",
        places: ["a"],
        transitions: [],
        initialMarking: { a: 1 },
        initialContext: {},
        terminalPlaces: [],
      };

      await fetch(`${baseUrl}/definitions/listed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });

      const res = await fetch(`${baseUrl}/definitions`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toContain("listed");
    });
  });

  describe("DELETE /definitions/:name", () => {
    it("deletes a saved definition", async () => {
      const def = {
        name: "doomed",
        places: ["a"],
        transitions: [],
        initialMarking: { a: 1 },
        initialContext: {},
        terminalPlaces: [],
      };

      await fetch(`${baseUrl}/definitions/doomed`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });

      const res = await fetch(`${baseUrl}/definitions/doomed`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deleted).toBe("doomed");

      // Gone from store
      const getRes = await fetch(`${baseUrl}/definitions/doomed`);
      expect(getRes.status).toBe(404);

      // Gone from runtime — can't create instances
      const createRes = await fetch(`${baseUrl}/workflows/doomed/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "x" }),
      });
      expect(createRes.status).toBe(400);
    });

    it("returns 404 for missing definition", async () => {
      const res = await fetch(`${baseUrl}/definitions/nonexistent`, { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await fetch(`${baseUrl}/nonexistent`);
      expect(res.status).toBe(404);
    });
  });
});
