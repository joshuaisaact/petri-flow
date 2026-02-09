import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { DecisionProvider, DecisionRequest } from "@petriflow/engine/decision";

export function createLlmProvider<
  Place extends string,
  Ctx extends Record<string, unknown>,
>(options?: {
  model?: string;
  systemPrompt?: string;
}): DecisionProvider<Place, Ctx> {
  return {
    async choose(req: DecisionRequest<Place, Ctx>) {
      const nonZero = Object.entries(req.marking).filter(([, v]) => v > 0);
      const transitionNames = req.enabled.map(t => t.name);

      const result = await generateText({
        model: anthropic(options?.model ?? "claude-sonnet-4-5-20250929"),
        system:
          options?.systemPrompt ??
          `You are a workflow controller for "${req.workflowName}". Pick the best transition to fire.`,
        prompt: `Current marking: ${nonZero.map(([k, v]) => `${k}=${v}`).join(", ")}
Context: ${JSON.stringify(req.context)}

Enabled transitions:
${req.enabled.map(t => `  ${t.name}: consumes [${t.inputs.join(", ")}] → produces [${t.outputs.join(", ")}]`).join("\n")}

Pick the transition to fire.`,
        tools: {
          pickTransition: tool({
            description: "Choose which transition to fire next",
            inputSchema: z.object({
              transition: z.enum(transitionNames as [string, ...string[]]),
              reasoning: z
                .string()
                .describe("Brief reasoning for this choice"),
            }),
          }),
        },
        toolChoice: { type: "tool", toolName: "pickTransition" },
        maxTokens: 256,
      });

      const call = result.toolCalls[0];
      return { transition: call.input.transition, reasoning: call.input.reasoning };
    },
  };
}
