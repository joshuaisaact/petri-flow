import { resolve } from "path";
import type { WorkflowDefinition } from "@petriflow/engine";

export async function loadWorkflow(
  filePath: string,
): Promise<WorkflowDefinition<string, Record<string, unknown>>> {
  const absolute = resolve(process.cwd(), filePath);
  const mod = await import(absolute);
  const definition = mod.default ?? mod.definition;
  if (!definition) {
    throw new Error(
      `Workflow file must export a WorkflowDefinition as default or named 'definition': ${filePath}`,
    );
  }
  return definition;
}
