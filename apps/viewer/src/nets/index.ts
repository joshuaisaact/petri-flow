import type { ViewerNet } from "../types";
import { coffee } from "./coffee";
import { contractApproval } from "./contract-approval";
import { orderCheckout } from "./order-checkout";
import { simpleAgent } from "./simple-agent";
import { agentBenchmark } from "./agent-benchmark";

export const nets: ViewerNet[] = [coffee, contractApproval, orderCheckout, simpleAgent, agentBenchmark];
