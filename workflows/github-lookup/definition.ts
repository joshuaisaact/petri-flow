import { defineWorkflow } from "@petriflow/engine/workflow";

/**
 * GitHub User Lookup — demonstrates built-in HTTP node executors.
 *
 * Two real HTTP requests, zero execute functions. The `http` node type
 * compiles automatically from `type + config` inside defineWorkflow.
 *
 * Flow:
 *   start → [fetchUser] → userLoaded → [fetchRepos] → done
 *
 * Each transition's response is merged into context under its name:
 *   ctx.fetchUser  = { status, ok, data }
 *   ctx.fetchRepos = { status, ok, data }
 */

type Place = "start" | "userLoaded" | "done";

type Ctx = {
  username: string;
  fetchUser: { status: number; ok: boolean; data: unknown } | null;
  fetchRepos: { status: number; ok: boolean; data: unknown } | null;
};

export const USERNAME = "octocat";

export const definition = defineWorkflow<Place, Ctx>({
  name: "github-lookup",
  places: ["start", "userLoaded", "done"],
  transitions: [
    {
      name: "fetchUser",
      type: "http",
      inputs: ["start"],
      outputs: ["userLoaded"],
      guard: null,
      config: {
        url: `https://api.github.com/users/${USERNAME}`,
        headers: { "User-Agent": "petriflow-example" },
      },
    },
    {
      name: "fetchRepos",
      type: "http",
      inputs: ["userLoaded"],
      outputs: ["done"],
      guard: null,
      config: {
        url: `https://api.github.com/users/${USERNAME}/repos?per_page=5&sort=updated`,
        headers: { "User-Agent": "petriflow-example" },
      },
    },
  ],
  initialMarking: { start: 1, userLoaded: 0, done: 0 },
  initialContext: {
    username: USERNAME,
    fetchUser: null,
    fetchRepos: null,
  },
  terminalPlaces: ["done"],
});

export default definition;
