import type { Tool } from "@voltagent/core";
import type { MemorySubsystem } from "../memory/index.js";
import type { HeartbeatConfigStore } from "../reminders/heartbeat-config-store.js";
import type { ReminderStore } from "../reminders/store.js";
import {
	createConfigureHeartbeatTool,
	createDismissReminderTool,
	createListRemindersTool,
	createScheduleReminderTool,
	createSnoozeReminderTool,
	duckDuckGoWebSearchTool,
	fetchUrlTool,
	findSkillsTool,
	installSkillTool,
	listInstalledSkillsTool,
	readInstalledSkillTool,
	readToolArtifactTool,
	searchToolArtifactTool,
	weatherTool,
	webSearchEnabled,
	webSearchTool,
} from "../tools/index.js";
import { wrapToolsWithArtifactSupport } from "../tools/tool-artifact-wrapper.js";

export type SharedAgentDeps = {
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

export function buildSirimathTools({
	memoryTools,
	reminderStore,
	heartbeatCfgStore,
	resolveReminderContext,
}: SharedAgentDeps) {
	// biome-ignore lint/suspicious/noExplicitAny: tool generics are invariant across schemas
	const tools: Tool<any, any>[] = [
		weatherTool,
		fetchUrlTool,
		duckDuckGoWebSearchTool,
		...(webSearchEnabled ? [webSearchTool] : []),
		listInstalledSkillsTool,
		readInstalledSkillTool,
		readToolArtifactTool,
		searchToolArtifactTool,
		findSkillsTool,
		installSkillTool,
		...memoryTools,
		createScheduleReminderTool(reminderStore, resolveReminderContext),
		createSnoozeReminderTool(reminderStore),
		createDismissReminderTool(reminderStore),
		createListRemindersTool(reminderStore),
		createConfigureHeartbeatTool(heartbeatCfgStore),
	];

	return wrapToolsWithArtifactSupport(tools);
}
