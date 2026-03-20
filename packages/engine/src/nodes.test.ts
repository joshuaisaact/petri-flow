import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { httpNode, timerNode, defaultNodes, isPrivateHost } from "./nodes.js";
import { defineWorkflow } from "./workflow.js";
import type { NodeExecutor } from "./nodes.js";

function mockFetch(handler: () => Promise<Response>) {
  const fn = Object.assign(mock(handler), { preconnect() {} }) as unknown as typeof fetch;
  return fn;
}

describe("httpNode", () => {
  it("validate throws on missing url", () => {
    expect(() => httpNode.validate({})).toThrow("requires a string 'url'");
    expect(() => httpNode.validate({ url: 123 })).toThrow("requires a string 'url'");
  });

  it("validate passes with url", () => {
    expect(() => httpNode.validate({ url: "http://example.com" })).not.toThrow();
  });

  it("GET returns namespaced JSON response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(async () => new Response(
      JSON.stringify({ message: "ok" }),
      { headers: { "content-type": "application/json" } },
    ));

    try {
      const result = await httpNode.execute({
        ctx: {},
        marking: {},
        config: { url: "http://example.com/api" },
        transitionName: "fetch_data",
      });

      expect(result).toEqual({
        fetch_data: { status: 200, ok: true, data: { message: "ok" } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST with body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(async () => new Response(
      JSON.stringify({ id: 1 }),
      { headers: { "content-type": "application/json" } },
    ));

    try {
      const result = await httpNode.execute({
        ctx: {},
        marking: {},
        config: {
          url: "http://example.com/api",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: { name: "test" },
        },
        transitionName: "create_item",
      });

      expect(result).toEqual({
        create_item: { status: 200, ok: true, data: { id: 1 } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("text response for non-JSON content-type", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(async () => new Response(
      "hello world",
      { headers: { "content-type": "text/plain" } },
    ));

    try {
      const result = await httpNode.execute({
        ctx: {},
        marking: {},
        config: { url: "http://example.com/text" },
        transitionName: "fetch_text",
      });

      expect(result).toEqual({
        fetch_text: { status: 200, ok: true, data: "hello world" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("timerNode", () => {
  it("validate throws on missing delayMs", () => {
    expect(() => timerNode.validate({})).toThrow("requires a non-negative number 'delayMs'");
    expect(() => timerNode.validate({ delayMs: "100" })).toThrow("requires a non-negative number 'delayMs'");
  });

  it("validate passes with delayMs", () => {
    expect(() => timerNode.validate({ delayMs: 100 })).not.toThrow();
  });

  it("delays for configured ms", async () => {
    const start = Date.now();
    const result = await timerNode.execute({
      ctx: {},
      marking: {},
      config: { delayMs: 50 },
      transitionName: "wait",
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timing variance
    expect(result).toEqual({
      wait: { delayed: true, delayMs: 50 },
    });
  });

  it("zero delay completes immediately", async () => {
    const start = Date.now();
    const result = await timerNode.execute({
      ctx: {},
      marking: {},
      config: { delayMs: 0 },
      transitionName: "instant",
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(result).toEqual({
      instant: { delayed: true, delayMs: 0 },
    });
  });
});

describe("defaultNodes", () => {
  it("returns map with http and timer", () => {
    const nodes = defaultNodes();
    expect(nodes.get("http")).toBe(httpNode);
    expect(nodes.get("timer")).toBe(timerNode);
    expect(nodes.size).toBe(2);
  });
});

describe("defineWorkflow with nodes", () => {
  it("compiles executor from type + config when no explicit execute", () => {
    const def = defineWorkflow({
      name: "timer-workflow",
      places: ["start", "end"] as const,
      transitions: [
        {
          name: "wait",
          type: "timer",
          inputs: ["start"],
          outputs: ["end"],
          guard: null,
          config: { delayMs: 100 },
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    });

    expect(def.executors.has("wait")).toBe(true);
  });

  it("explicit execute takes precedence over node", async () => {
    const customExecute = async () => ({ custom: true });
    const def = defineWorkflow({
      name: "explicit-wins",
      places: ["start", "end"] as const,
      transitions: [
        {
          name: "do_it",
          type: "http",
          inputs: ["start"],
          outputs: ["end"],
          guard: null,
          config: { url: "http://example.com" },
          execute: customExecute,
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    });

    const executor = def.executors.get("do_it")!;
    const result = await executor({} as any, {} as any);
    expect(result).toEqual({ custom: true });
  });

  it("skips transitions with no config", () => {
    const def = defineWorkflow({
      name: "no-config",
      places: ["start", "end"] as const,
      transitions: [
        {
          name: "go",
          type: "automatic",
          inputs: ["start"],
          outputs: ["end"],
          guard: null,
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    });

    expect(def.executors.has("go")).toBe(false);
  });

  it("skips unknown types (automatic, manual)", () => {
    const def = defineWorkflow({
      name: "unknown-types",
      places: ["start", "mid", "end"] as const,
      transitions: [
        {
          name: "auto_step",
          type: "automatic",
          inputs: ["start"],
          outputs: ["mid"],
          guard: null,
          config: { foo: "bar" },
        },
        {
          name: "manual_step",
          type: "manual",
          inputs: ["mid"],
          outputs: ["end"],
          guard: null,
          config: { foo: "bar" },
        },
      ],
      initialMarking: { start: 1, mid: 0, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    });

    expect(def.executors.has("auto_step")).toBe(false);
    expect(def.executors.has("manual_step")).toBe(false);
  });

  it("custom registry override", () => {
    const customNode: NodeExecutor = {
      validate() {},
      async execute({ transitionName }) {
        return { [transitionName]: { custom: true } };
      },
    };

    const nodes = new Map([["custom", customNode]]);
    const def = defineWorkflow({
      name: "custom-registry",
      places: ["start", "end"] as const,
      transitions: [
        {
          name: "do_custom",
          type: "custom",
          inputs: ["start"],
          outputs: ["end"],
          guard: null,
          config: { key: "value" },
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    }, { nodes });

    expect(def.executors.has("do_custom")).toBe(true);
  });

  it("validate throws during defineWorkflow for bad config", () => {
    expect(() => defineWorkflow({
      name: "bad-http",
      places: ["start", "end"] as const,
      transitions: [
        {
          name: "bad_fetch",
          type: "http",
          inputs: ["start"],
          outputs: ["end"],
          guard: null,
          config: { method: "GET" }, // missing url
        },
      ],
      initialMarking: { start: 1, end: 0 },
      initialContext: {},
      terminalPlaces: ["end"],
    })).toThrow("requires a string 'url'");
  });

  it("timerNode rejects negative delayMs", () => {
    expect(() => timerNode.validate({ delayMs: -1 })).toThrow("requires a non-negative number");
  });
});

describe("isPrivateHost", () => {
  it("blocks localhost", () => {
    expect(isPrivateHost("localhost")).toBe(true);
  });

  it("blocks full 127.0.0.0/8 range", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("127.0.0.2")).toBe(true);
    expect(isPrivateHost("127.255.255.255")).toBe(true);
  });

  it("blocks 10.x.x.x", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
    expect(isPrivateHost("10.255.255.255")).toBe(true);
  });

  it("blocks 172.16.0.0/12", () => {
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.255")).toBe(true);
    expect(isPrivateHost("172.15.0.1")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false);
  });

  it("blocks 192.168.x.x", () => {
    expect(isPrivateHost("192.168.0.1")).toBe(true);
    expect(isPrivateHost("192.168.255.255")).toBe(true);
  });

  it("blocks link-local 169.254.x.x", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("169.254.0.1")).toBe(true);
  });

  it("blocks CGNAT 100.64.0.0/10", () => {
    expect(isPrivateHost("100.64.0.1")).toBe(true);
    expect(isPrivateHost("100.127.255.255")).toBe(true);
    expect(isPrivateHost("100.63.255.255")).toBe(false);
    expect(isPrivateHost("100.128.0.1")).toBe(false);
  });

  it("blocks 0.0.0.0/8", () => {
    expect(isPrivateHost("0.0.0.0")).toBe(true);
    expect(isPrivateHost("0.0.0.1")).toBe(true);
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(isPrivateHost("::1")).toBe(true);
  });

  it("blocks IPv6 unspecified ::", () => {
    expect(isPrivateHost("::")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6", () => {
    expect(isPrivateHost("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateHost("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateHost("::ffff:7f00:1")).toBe(true);
  });

  it("blocks IPv6 unique local (fc00::/7)", () => {
    expect(isPrivateHost("fc00::1")).toBe(true);
    expect(isPrivateHost("fd12:3456::1")).toBe(true);
  });

  it("blocks IPv6 link-local (fe80::/10)", () => {
    expect(isPrivateHost("fe80::1")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("1.1.1.1")).toBe(false);
    expect(isPrivateHost("203.0.113.1")).toBe(false);
  });

  it("allows public hostnames", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("api.github.com")).toBe(false);
  });
});

describe("httpNode SSRF", () => {
  it("blocks requests to private hosts", async () => {
    await expect(httpNode.execute({
      ctx: {},
      marking: {},
      config: { url: "http://127.0.0.1/admin" },
      transitionName: "ssrf",
    })).rejects.toThrow("blocked request to private/internal host");
  });

  it("blocks requests to metadata endpoint", async () => {
    await expect(httpNode.execute({
      ctx: {},
      marking: {},
      config: { url: "http://169.254.169.254/latest/meta-data/" },
      transitionName: "ssrf",
    })).rejects.toThrow("blocked request to private/internal host");
  });

  it("blocks requests to localhost", async () => {
    await expect(httpNode.execute({
      ctx: {},
      marking: {},
      config: { url: "http://localhost:8080/secret" },
      transitionName: "ssrf",
    })).rejects.toThrow("blocked request to private/internal host");
  });

  it("blocks requests to IPv6 loopback", async () => {
    await expect(httpNode.execute({
      ctx: {},
      marking: {},
      config: { url: "http://[::1]/secret" },
      transitionName: "ssrf",
    })).rejects.toThrow("blocked request to private/internal host");
  });
});
