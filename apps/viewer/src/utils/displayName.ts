const DISPLAY_NAMES: Record<string, string> = {
  // Place categories
  default: "State",
  terminal: "Terminal",
  human: "Human gate",
  resource: "Resource",
  // Transition types
  automatic: "Automatic",
  manual: "Manual",
  timer: "Timer",
  script: "Script",
  http: "HTTP",
  ai: "AI",
  // Workflow names
  "coffee": "Making Coffee",
  "contract-approval": "Contract Approval",
  "order-checkout": "Order Checkout",
  "simple-agent": "Simple Agent",
  "agent-benchmark": "Agent Benchmark",
};

/** Map internal identifiers (place categories, transition types) to display labels. */
export function displayName(key: string): string {
  return DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
