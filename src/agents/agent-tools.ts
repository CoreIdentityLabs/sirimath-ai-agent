import { HeartbeatConfigStore } from "../reminders/heartbeat-config-store.js";
import { ReminderStore } from "../reminders/store.js";
import {
  createConfigureHeartbeatTool,
  createDismissReminderTool,
  createListRemindersTool,
  createScheduleReminderTool,
  createSnoozeReminderTool,
  fetchUrlTool,
  findSkillsTool,
  installSkillTool,
  weatherTool,
  webSearchEnabled,
  webSearchTool,
} from "../tools/index.js";

export type SharedAgentDeps = {
  memoryTools: Array<any>;
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
