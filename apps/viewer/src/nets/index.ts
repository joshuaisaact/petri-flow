import type { ViewerNet } from "../types";
import { coffee } from "./coffee";
import { orderCheckout } from "./order-checkout";
import { simpleAgent } from "./simple-agent";
import { agentBenchmark } from "./agent-benchmark";

export const nets: ViewerNet[] = [coffee, orderCheckout, simpleAgent, agentBenchmark];
