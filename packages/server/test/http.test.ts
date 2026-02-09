import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { defineWorkflow } from "@petriflow/engine/workflow";
import { WorkflowRuntime } from "../src/runtime.js";
import { createServer } from "../src/http.js";
import type { Server } from "bun";

const simpleDefinition = defineWorkflow({
  name: "simple",
  places: ["start", "end"] as const,
  transitions: [{ name: "go", inputs: ["start"], outputs: ["end"] }],
  initialMarking: { start: 1, end: 0 },
  initialContext: {},
  terminalPlaces: ["end"],
});

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
      execute: async () => ({ waterTemp: 96 }),
    },
    {
      name: "grindBeans",
      inputs: ["beansWhole"],
      outputs: ["beansGround"],
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

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await fetch(`${baseUrl}/nonexistent`);
      expect(res.status).toBe(404);
    });
  });
});
