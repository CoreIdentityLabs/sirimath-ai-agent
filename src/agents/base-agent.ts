import { Agent, type LanguageModel, type Memory } from "@voltagent/core";
import { loadLlmLimitConfig } from "../config/llm-limits.js";
import type { MemorySubsystem } from "../memory/index.js";
import type { HeartbeatConfigStore } from "../reminders/heartbeat-config-store.js";
import type { ReminderStore } from "../reminders/store.js";
import { webSearchEnabled } from "../tools/index.js";
import { type SharedAgentDeps, buildSirimathTools } from "./agent-tools.js";
import { buildLlmBudgetHooks } from "./llm-budget.js";

type BaseAgentOptions = {
	model: LanguageModel;
	memory: Memory;
	memoryTools: MemorySubsystem["tools"];
	reminderStore: ReminderStore;
	heartbeatCfgStore: HeartbeatConfigStore;
	resolveReminderContext?: () => {
		userIdentity: string;
		channelId: string;
		channelUserId: string;
		conversationId: string;
	} | null;
};

export function createBaseAgent({
	model,
	memory,
	memoryTools,
	reminderStore,
	heartbeatCfgStore,
	resolveReminderContext,
}: BaseAgentOptions) {
	const llmLimits = loadLlmLimitConfig();

	return new Agent({
		name: "sirimath-ai-agent",
		instructions: `You are Sirimath, a Telegram personal assistant created by Chamara Dodandeniya. Be helpful, concise, and practical.

Tool routing:
- Weather -> getWeather
- URL/API fetch -> fetchUrl
- No-key web search -> duckDuckGoWebSearch, then fetchUrl only on the most relevant 1 to 3 links
- Installed skills list -> listInstalledSkills
- Installed skill details -> readInstalledSkill
- Skill discovery -> findSkills
- Skill install after user confirmation -> installSkill
- "What do you remember about me?" -> memoryViewProfile
- Forget something -> memoryForget
- Export memory -> memoryExport
- Erase all memory -> memoryErase with confirmation

Large tool outputs:
- If a tool returns artifactStored=true with an artifactId, do not ask the user to resend anything.
- Use searchToolArtifact first to locate the relevant chunk.
- Use readToolArtifact only for the smallest number of chunks needed to answer.
- Avoid loading unnecessary chunks into context.`,
		model,
		tools: buildSirimathTools({
			memoryTools,
			reminderStore,
			heartbeatCfgStore,
			resolveReminderContext,
		} satisfies SharedAgentDeps),
		memory,
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
