const DISPLAY_NAMES: Record<string, string> = {
  default: "State",
  terminal: "Terminal",
  human: "Human gate",
  resource: "Resource",
  automatic: "Automatic",
  manual: "Manual",
  timer: "Timer",
  script: "Script",
  http: "HTTP",
  ai: "AI",
};

/** Map internal identifiers (place categories, transition types) to display labels. */
export function displayName(key: string): string {
  return DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
