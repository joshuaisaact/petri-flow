import type { ViewerNet } from "../types";
import { githubLookup } from "./github-lookup";
import { coffee } from "./coffee";
import { contractApproval } from "./contract-approval";
import { orderCheckout } from "./order-checkout";
import { simpleAgent } from "./simple-agent";
import { agentBenchmark } from "./agent-benchmark";
import { openclawToolApproval } from "./openclaw-tool-approval";
import { openclawMessageGating } from "./openclaw-message-gating";
import { openclawBudgetEscalation } from "./openclaw-budget-escalation";
import { openclawSandboxIsolation, openclawSandboxIsolationLocked } from "./openclaw-sandbox-isolation";

export const nets: ViewerNet[] = [
  coffee,
  githubLookup,
  contractApproval,
  orderCheckout,
  simpleAgent,
  agentBenchmark,
  openclawToolApproval,
  openclawMessageGating,
  openclawBudgetEscalation,
  openclawSandboxIsolation,
  openclawSandboxIsolationLocked,
];
