import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Server } from "bun";
import type { WorkflowRuntime, RuntimeEvent } from "./runtime.js";
import { loadWorkflow } from "./loader.js";

export type ServerOptions = {
  runtime: WorkflowRuntime;
  port?: number;
  hostname?: string;
};

export function createApp(runtime: WorkflowRuntime): Hono {
  const app = new Hono();

  app.get("/workflows", (c) => {
    return c.json(runtime.listWorkflows());
  });

  app.post("/workflows/register", async (c) => {
    const body = await c.req.json<{ path?: string }>();
    if (!body.path) {
      return c.json({ error: "Missing 'path' in request body" }, 400);
    }
    try {
      const definition = await loadWorkflow(body.path);
      runtime.register(definition);
      return c.json({ registered: definition.name }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/workflows/:name/instances", async (c) => {
    const name = c.req.param("name");
    const status = c.req.query("status");
    const instances = await runtime.listInstances(name, status);
    return c.json(instances);
  });

  app.post("/workflows/:name/instances", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.json<{ id?: string }>();
    if (!body.id) {
      return c.json({ error: "Missing 'id' in request body" }, 400);
    }
    try {
      const marking = await runtime.createInstance(name, body.id);
      return c.json({ id: body.id, marking }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/instances/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const state = await runtime.inspect(id);
      return c.json(state);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.post("/instances/:id/inject", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ place?: string; count?: number }>();
    if (!body.place) {
      return c.json({ error: "Missing 'place' in request body" }, 400);
    }
    try {
      await runtime.injectToken(id, body.place, body.count ?? 1);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/events", (c) => {
    const filterWorkflow = c.req.query("workflow");
    const filterInstance = c.req.query("instance");

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: "", event: "connected" });

      let closed = false;
      const unsubscribe = runtime.subscribe((event: RuntimeEvent) => {
        if (closed) return;
        if (filterWorkflow && event.workflow !== filterWorkflow) return;
        if (filterInstance && event.instanceId !== filterInstance) return;

        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          closed = true;
          unsubscribe();
        });
      });

      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });

      // Keep the stream open until aborted
      while (!closed) {
        await Bun.sleep(1000);
      }
    });
  });

  return app;
}

export function createServer(options: ServerOptions): Server<undefined> {
  const { runtime, port = 3000, hostname = "0.0.0.0" } = options;
  const app = createApp(runtime);

  return Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
  });
}
