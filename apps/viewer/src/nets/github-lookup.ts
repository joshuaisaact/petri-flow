import { definition } from "@workflows/github-lookup/definition";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const githubLookup: ViewerNet = {
  name: "GitHub Lookup",
  description:
    "Two real HTTP calls to the GitHub API. In Execute mode, fetchUser and fetchRepos hit the network and populate context with live response data.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    start: { category: "default", label: "Start" },
    userLoaded: { category: "default", label: "User Loaded" },
    done: { category: "terminal", label: "Done" },
  },
};
