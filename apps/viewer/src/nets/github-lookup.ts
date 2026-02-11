import { definition } from "@workflows/github-lookup/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const githubLookup: ViewerNet = {
  name: "GitHub Lookup",
  description:
    "Two real HTTP calls to the GitHub API. In Execute mode, fetchUser and fetchRepos hit the network and populate context with live response data.",
  definition,
  net: toNet(definition.net),
  intro: {
    title: "Live HTTP Execution",
    bullets: [
      "Two real HTTP calls to the GitHub API — fetchUser and fetchRepos hit the network in Execute mode.",
      "In Simulate mode, transitions fire instantly with no side effects. Switch to Execute to see live data.",
      "Response data populates the context panel, showing how executors enrich workflow state.",
    ],
    tip: "Switch to Execute mode and watch the Context panel fill with live GitHub API data.",
  },
  placeMetadata: {
    start: { category: "default", label: "Start" },
    userLoaded: { category: "default", label: "User Loaded" },
    done: { category: "terminal", label: "Done" },
  },
};
