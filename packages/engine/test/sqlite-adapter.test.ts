import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDispatcher } from "petri-ts";
import type { Marking } from "petri-ts";
import { sqliteAdapter } from "../src/persistence/sqlite-adapter.js";
import type { WorkflowNet } from "../src/types.js";

type Place = "idle" | "processing" | "done";

const net: WorkflowNet<Place> = {
  transitions: [
    { name: "start", inputs: ["idle"], outputs: ["processing"], guard: null },
    { name: "finish", inputs: ["processing"], outputs: ["done"], guard: null },
  ],
  initialMarking: { idle: 1, processing: 0, done: 0 },
};

describe("sqliteAdapter", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("round-trips with createDispatcher", async () => {
    const adapter = sqliteAdapter<Place>(db, "test-workflow");
    const dispatcher = createDispatcher(net, adapter);

    const created = await dispatcher.create("instance-1");
    expect(created).toEqual({ idle: 1, processing: 0, done: 0 });

    const afterStart = await dispatcher.dispatch("instance-1", "start");
    expect(afterStart).toEqual({ idle: 0, processing: 1, done: 0 });

    const afterFinish = await dispatcher.dispatch("instance-1", "finish");
    expect(afterFinish).toEqual({ idle: 0, processing: 0, done: 1 });

    const state = await dispatcher.inspect("instance-1");
    expect(state.marking).toEqual({ idle: 0, processing: 0, done: 1 });
  });

  it("saves and loads extended state", async () => {
    type Ctx = { approver: string };
    const adapter = sqliteAdapter<Place, Ctx>(db, "test-workflow");

    await adapter.saveExtended("ext-1", {
      marking: { idle: 1, processing: 0, done: 0 },
      workflowName: "test-workflow",
      context: { approver: "alice" },
      status: "active",
      version: "v1",
    });

    const loaded = await adapter.loadExtended("ext-1");
    expect(loaded.marking).toEqual({ idle: 1, processing: 0, done: 0 });
    expect(loaded.context).toEqual({ approver: "alice" });
    expect(loaded.status).toBe("active");
    expect(loaded.workflowName).toBe("test-workflow");
  });

  it("updates extended state on re-save", async () => {
    type Ctx = { step: number };
    const adapter = sqliteAdapter<Place, Ctx>(db, "test-workflow");

    await adapter.saveExtended("upd-1", {
      marking: { idle: 1, processing: 0, done: 0 },
      workflowName: "test-workflow",
      context: { step: 1 },
      status: "active",
    });

    await adapter.saveExtended("upd-1", {
      marking: { idle: 0, processing: 1, done: 0 },
      workflowName: "test-workflow",
      context: { step: 2 },
      status: "active",
    });

    const loaded = await adapter.loadExtended("upd-1");
    expect(loaded.marking).toEqual({ idle: 0, processing: 1, done: 0 });
    expect(loaded.context).toEqual({ step: 2 });
  });

  it("lists active instances", async () => {
    type Ctx = Record<string, unknown>;
    const adapter = sqliteAdapter<Place, Ctx>(db, "test-workflow");

    await adapter.saveExtended("active-1", {
      marking: net.initialMarking,
      workflowName: "test-workflow",
      context: {},
      status: "active",
    });
    await adapter.saveExtended("completed-1", {
      marking: { idle: 0, processing: 0, done: 1 },
      workflowName: "test-workflow",
      context: {},
      status: "completed",
    });

    const active = await adapter.listActive();
    expect(active).toEqual(["active-1"]);
  });

  it("throws on missing instance", async () => {
    const adapter = sqliteAdapter<Place>(db, "test-workflow");
    expect(adapter.load("nonexistent")).rejects.toThrow("Instance not found");
  });
});
