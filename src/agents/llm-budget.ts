import type { AgentHooks } from "@voltagent/core";
import type { UIMessage } from "ai";
import { loadLlmLimitConfig } from "../config/llm-limits.js";

const APPROX_CHARS_PER_TOKEN = 4;

function estimateMessageTokens(message: UIMessage): number {
	return Math.ceil(JSON.stringify(message).length / APPROX_CHARS_PER_TOKEN);
}

function pruneMessagesToTokenBudget(
	messages: UIMessage[],
	tokenBudget: number | null,
): UIMessage[] {
	if (!tokenBudget) return messages;

	const systemMessages = messages.filter(
		(message) => message.role === "system",
	);
	const otherMessages = messages.filter((message) => message.role !== "system");
	const keptMessages = [...systemMessages];
	let remainingBudget =
		tokenBudget -
		systemMessages.reduce(
			(total, message) => total + estimateMessageTokens(message),
			0,
		);

	for (let index = otherMessages.length - 1; index >= 0; index -= 1) {
		const message = otherMessages[index];
		const tokens = estimateMessageTokens(message);

		if (tokens <= remainingBudget) {
			keptMessages.splice(systemMessages.length, 0, message);
			remainingBudget -= tokens;
		}

		if (remainingBudget <= 0) {
			break;
		}
	}

	return keptMessages;
}

function estimateToolOverheadTokens(agent: {
	getTools?: () => Array<{ name?: string; description?: string }> | undefined;
}): number {
	const tools = agent.getTools?.() ?? [];
	if (tools.length === 0) return 0;

	return tools.reduce((total, tool) => {
		const descriptionLength = tool.description?.length ?? 0;
		const nameLength = tool.name?.length ?? 0;
		return total + 140 + Math.ceil((descriptionLength + nameLength) / 4);
	}, 0);
}

export function buildLlmBudgetHooks(): AgentHooks | undefined {
	const llmLimits = loadLlmLimitConfig();
	if (!llmLimits.contextWindowTokens) return undefined;
	const contextWindowTokens = llmLimits.contextWindowTokens;

	return {
		onPrepareMessages: async ({ messages, agent }) => {
			const estimatedToolOverhead = Math.max(
				llmLimits.toolOverheadTokens,
				estimateToolOverheadTokens(agent),
			);
			const dynamicPromptBudget = Math.max(
				256,
				contextWindowTokens - llmLimits.maxOutputTokens - estimatedToolOverhead,
			);

			return {
				messages: pruneMessagesToTokenBudget(messages, dynamicPromptBudget),
			};
		},
	};
}
