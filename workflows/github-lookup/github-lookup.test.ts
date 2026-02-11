import { describe, it, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import {
  Scheduler,
  createExecutor,
  sqliteAdapter,
  toNet,
  terminalStates,
} from "@petriflow/engine";
import { analyse } from "@petriflow/engine";
import { definition } from "./index.js";

describe("github-lookup workflow", () => {
  describe("structural analysis", () => {
    it("has exactly one terminal state", () => {
      const net = toNet(definition.net);
      const terminal = terminalStates(net);
      expect(terminal.length).toBe(1);
      expect(terminal[0]!.done).toBe(1);
    });

    it("passes analyse", () => {
      const result = analyse(definition);
      expect(result.reachableStateCount).toBe(3); // start → userLoaded → done
      expect(result.terminalStates.length).toBe(1);
      expect(result.unexpectedTerminalStates).toHaveLength(0);
    });

    it("both transitions have http node executors compiled", () => {
      expect(definition.executors.has("fetchUser")).toBe(true);
      expect(definition.executors.has("fetchRepos")).toBe(true);
    });

    it("no explicit execute functions — all compiled from type + config", () => {
      // The transitions in the net should have no execute property
      for (const t of definition.net.transitions) {
        expect((t as Record<string, unknown>).execute).toBeUndefined();
      }
    });
  });

  describe("execution (mocked)", () => {
    it("runs to completion with mocked fetch", async () => {
      const originalFetch = globalThis.fetch;
      const calls: string[] = [];
      globalThis.fetch = Object.assign(
        mock(async (url: string) => {
          calls.push(url);
          if (url.includes("/repos")) {
            return new Response(
              JSON.stringify([
                { name: "hello-world", stargazers_count: 42, language: "TypeScript" },
                { name: "Spoon-Knife", stargazers_count: 12, language: null },
              ]),
              { headers: { "content-type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              login: "octocat",
              name: "The Octocat",
              bio: "GitHub mascot",
              public_repos: 8,
            }),
            { headers: { "content-type": "application/json" } },
          );
        }),
        { preconnect() {} },
      ) as unknown as typeof fetch;

      try {
        const db = new Database(":memory:");
        const fired: string[] = [];

        const scheduler = new Scheduler(
          createExecutor(definition),
          { adapter: sqliteAdapter(db, definition.name) },
          { onFire: (_id, name) => fired.push(name) },
        );

        await scheduler.createInstance("test-1");

        for (let i = 0; i < 10; i++) {
          const n = await scheduler.tick();
          if (n === 0) break;
        }

        expect(fired).toEqual(["fetchUser", "fetchRepos"]);

        const state = await scheduler.inspect("test-1");
        expect(state.status).toBe("completed");
        expect(state.marking.done).toBe(1);
        expect(state.context.fetchUser).toEqual({
          status: 200,
          ok: true,
          data: { login: "octocat", name: "The Octocat", bio: "GitHub mascot", public_repos: 8 },
        });
        expect(state.context.fetchRepos).toEqual({
          status: 200,
          ok: true,
          data: [
            { name: "hello-world", stargazers_count: 42, language: "TypeScript" },
            { name: "Spoon-Knife", stargazers_count: 12, language: null },
          ],
        });

        expect(calls).toHaveLength(2);
        expect(calls[0]).toContain("/users/octocat");
        expect(calls[1]).toContain("/users/octocat/repos");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("live", () => {
    it("fetches real data from GitHub API", async () => {
      const db = new Database(":memory:");
      const fired: string[] = [];

      const scheduler = new Scheduler(
        createExecutor(definition),
        { adapter: sqliteAdapter(db, definition.name) },
        { onFire: (_id, name) => fired.push(name) },
      );

      await scheduler.createInstance("live-1");

      for (let i = 0; i < 10; i++) {
        const n = await scheduler.tick();
        if (n === 0) break;
      }

      expect(fired).toEqual(["fetchUser", "fetchRepos"]);

      const state = await scheduler.inspect("live-1");
      expect(state.status).toBe("completed");

      // Verify real GitHub data
      const user = state.context.fetchUser as { status: number; ok: boolean; data: Record<string, unknown> };
      expect(user.ok).toBe(true);
      expect(user.data.login).toBe("octocat");
      expect(typeof user.data.public_repos).toBe("number");

      const repos = state.context.fetchRepos as { status: number; ok: boolean; data: unknown[] };
      expect(repos.ok).toBe(true);
      expect(repos.data.length).toBeGreaterThan(0);
      expect((repos.data[0] as Record<string, unknown>).name).toBeDefined();
    });
  });
});
