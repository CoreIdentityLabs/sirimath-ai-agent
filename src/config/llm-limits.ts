const DEFAULT_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_SUMMARIZATION_TRIGGER_TOKENS = 20_000;
const DEFAULT_SUMMARIZATION_KEEP_MESSAGES = 5;
const DEFAULT_MAX_HISTORY_ENTRIES = 1_000;
const DEFAULT_MEMORY_MATCHED_LIMIT = 12;
const DEFAULT_MEMORY_RECENT_LIMIT = 5;

function parsePositiveInt(
	name: string,
	fallback: number | null,
): number | null {
	const raw = process.env[name];
	if (!raw) return fallback;

	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value <= 0) {
		console.warn(
			`[llm-limits] Ignoring invalid ${name}=${raw}. Expected a positive integer.`,
		);
		return fallback;
	}

	return value;
}

export interface LlmLimitConfig {
	contextWindowTokens: number | null;
	maxOutputTokens: number;
	toolOverheadTokens: number;
	promptTokenBudget: number | null;
	summarizationTriggerTokens: number;
	summarizationKeepMessages: number;
	summarizationMaxOutputTokens: number;
	maxHistoryEntries: number;
	memoryMatchedLimit: number;
	memoryRecentLimit: number;
	memoryPromptTokenBudget: number | null;
}

export function loadLlmLimitConfig(): LlmLimitConfig {
	const contextWindowTokens = parsePositiveInt("LLM_CONTEXT_WINDOW", null);
	const configuredMaxOutputTokens = parsePositiveInt(
		"LLM_MAX_OUTPUT_TOKENS",
		null,
	);
	const maxOutputTokens =
		configuredMaxOutputTokens ??
		(contextWindowTokens
			? Math.max(128, Math.min(512, Math.floor(contextWindowTokens * 0.2)))
			: DEFAULT_MAX_OUTPUT_TOKENS);

	const toolOverheadTokens =
		parsePositiveInt("LLM_TOOL_OVERHEAD_TOKENS", null) ??
		(contextWindowTokens
			? Math.max(512, Math.min(1800, Math.floor(contextWindowTokens * 0.35)))
			: 0);

	const promptTokenBudget = contextWindowTokens
		? Math.max(256, contextWindowTokens - maxOutputTokens - toolOverheadTokens)
		: null;

	const summarizationTriggerTokens =
		parsePositiveInt("LLM_SUMMARIZATION_TRIGGER_TOKENS", null) ??
		(promptTokenBudget
			? Math.max(600, Math.floor(promptTokenBudget * 0.55))
			: DEFAULT_SUMMARIZATION_TRIGGER_TOKENS);

	const summarizationKeepMessages =
		parsePositiveInt("LLM_SUMMARIZATION_KEEP_MESSAGES", null) ??
		(contextWindowTokens ? 4 : DEFAULT_SUMMARIZATION_KEEP_MESSAGES);

	const summarizationMaxOutputTokens =
		parsePositiveInt("LLM_SUMMARIZATION_MAX_OUTPUT_TOKENS", null) ??
		Math.max(96, Math.min(256, Math.floor(maxOutputTokens * 0.5)));

	const maxHistoryEntries =
		parsePositiveInt("LLM_MAX_HISTORY_ENTRIES", null) ??
		(contextWindowTokens ? 200 : DEFAULT_MAX_HISTORY_ENTRIES);

	const memoryMatchedLimit =
		parsePositiveInt("LLM_MEMORY_MATCHED_LIMIT", null) ??
		(contextWindowTokens ? 4 : DEFAULT_MEMORY_MATCHED_LIMIT);

	const memoryRecentLimit =
		parsePositiveInt("LLM_MEMORY_RECENT_LIMIT", null) ??
		(contextWindowTokens ? 2 : DEFAULT_MEMORY_RECENT_LIMIT);

	const memoryPromptTokenBudget =
		parsePositiveInt("LLM_MEMORY_PROMPT_TOKENS", null) ??
		(promptTokenBudget
			? Math.max(128, Math.min(512, Math.floor(promptTokenBudget * 0.2)))
			: null);

	return {
		contextWindowTokens,
		maxOutputTokens,
		toolOverheadTokens,
		promptTokenBudget,
		summarizationTriggerTokens,
		summarizationKeepMessages,
		summarizationMaxOutputTokens,
		maxHistoryEntries,
		memoryMatchedLimit,
		memoryRecentLimit,
		memoryPromptTokenBudget,
	};
}
