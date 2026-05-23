import type { MemorySubsystem } from "../memory/index.js";
import type { HeartbeatConfigStore } from "../reminders/heartbeat-config-store.js";
import type { ReminderStore } from "../reminders/store.js";
import {
	createConfigureHeartbeatTool,
	createDismissReminderTool,
	createListRemindersTool,
	createScheduleReminderTool,
	createSnoozeReminderTool,
	fetchUrlTool,
	findSkillsTool,
	listInstalledSkillsTool,
	installSkillTool,
	readInstalledSkillTool,
	weatherTool,
	webSearchEnabled,
	webSearchTool,
} from "../tools/index.js";

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
	return [
		weatherTool,
		fetchUrlTool,
		...(webSearchEnabled ? [webSearchTool] : []),
		listInstalledSkillsTool,
		readInstalledSkillTool,
		findSkillsTool,
		installSkillTool,
		...memoryTools,
		createScheduleReminderTool(reminderStore, resolveReminderContext),
		createSnoozeReminderTool(reminderStore),
		createDismissReminderTool(reminderStore),
		createListRemindersTool(reminderStore),
		createConfigureHeartbeatTool(heartbeatCfgStore),
	];
}
