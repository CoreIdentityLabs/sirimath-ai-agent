// Export all tools from this directory
export { weatherTool } from "./weather.js";
export { findSkillsTool } from "./find-skills.js";
export { installSkillTool } from "./install-skill.js";
export { listInstalledSkillsTool } from "./list-installed-skills.js";
export { readInstalledSkillTool } from "./read-installed-skill.js";
export { fetchUrlTool } from "./fetch-url.js";
export {
	duckDuckGoWebSearchEnabled,
	duckDuckGoWebSearchTool,
} from "./duckduckgo-web-search.js";
export { webSearchTool, webSearchEnabled } from "./web-search.js";
export {
	readToolArtifactTool,
	searchToolArtifactTool,
} from "./tool-artifact-tools.js";

export {
	buildInstalledSkillDetailView,
	formatInstalledSkillSummary,
	loadInstalledSkillsCatalog,
	lookupInstalledSkill,
	normalizeInstalledSkillLookup,
	InstalledSkillCatalogSchema,
	InstalledSkillSchema,
	InstalledSkillStatusSchema,
} from "./shared/installed-skills.js";

// Reminder tool factories (take store dependencies at startup)
export { createScheduleReminderTool } from "./schedule-reminder.js";
export { createSnoozeReminderTool } from "./snooze-reminder.js";
export { createDismissReminderTool } from "./dismiss-reminder.js";
export { createListRemindersTool } from "./list-reminders.js";
export { createConfigureHeartbeatTool } from "./configure-heartbeat.js";
