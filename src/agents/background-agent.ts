import { Agent, LanguageModel, type Memory } from "@voltagent/core";
import { buildSirimathTools, type SharedAgentDeps } from "./agent-tools.js";

type BackgroundAgentOptions = SharedAgentDeps & {
  model: LanguageModel;
  memory: Memory;
};

export function createBackgroundAgent({
  model,
  memory,
  ...deps
}: BackgroundAgentOptions) {
  return new Agent({
    name: "sirimath-background-agent",
    model,
    memory,
    tools: buildSirimathTools(deps),
    instructions: `You are Sirimath running in background mode.
You are executing a scheduled proactive task for a user who is not currently present.
Use the provided task instruction and available tools to complete the job with current data when needed.
Do not ask follow-up questions.
Do not expose internal reasoning.
If you cannot safely complete the task, return a concise failure summary for the caller instead of inventing output.
When you succeed, produce only the final user-facing message and begin it with "Proactive update:".`,
    summarization: {
      enabled: true,
      triggerTokens: 20000,
      keepMessages: 5,
      maxOutputTokens: 800,
      systemPrompt: "Summarize the conversation for the next step.",
    },
    maxSteps: 5,
  });
}
