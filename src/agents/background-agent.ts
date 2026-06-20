import { Agent, type LanguageModel, type Memory } from "@voltagent/core";
import { loadLlmLimitConfig } from "../config/llm-limits.js";
import { type SharedAgentDeps, buildSirimathTools } from "./agent-tools.js";
import { buildLlmBudgetHooks } from "./llm-budget.js";

type BackgroundAgentOptions = SharedAgentDeps & {
	model: LanguageModel;
	memory: Memory;
};

export function createBackgroundAgent({
	model,
	memory,
	...deps
}: BackgroundAgentOptions) {
	const llmLimits = loadLlmLimitConfig();

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
If a tool returns artifactStored=true with an artifactId, use searchToolArtifact and readToolArtifact to inspect only the relevant chunks.
If you cannot safely complete the task, return a concise failure summary for the caller instead of inventing output.
When you succeed, produce only the final user-facing message and begin it with "Proactive update:".`,
		hooks: buildLlmBudgetHooks(),
		summarization: {
			enabled: true,
			triggerTokens: llmLimits.summarizationTriggerTokens,
			keepMessages: llmLimits.summarizationKeepMessages,
			maxOutputTokens: llmLimits.summarizationMaxOutputTokens,
			systemPrompt: "Summarize the conversation for the next step.",
		},
		maxOutputTokens: llmLimits.maxOutputTokens,
		maxHistoryEntries: llmLimits.maxHistoryEntries,
		maxSteps: 5,
	});
}
