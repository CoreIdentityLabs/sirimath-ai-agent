import "dotenv/config";
import { createClient } from "@libsql/client";
import {
	Agent,
	Memory,
	VoltAgent,
	VoltAgentObservability,
	VoltOpsClient,
} from "@voltagent/core";
import {
	LibSQLMemoryAdapter,
	LibSQLObservabilityAdapter,
} from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { startTelegramBot } from "./channels/telegram.js";
import { resolveModel } from "./config/model-provider.js";
import { resolveVoiceProvider } from "./config/voice-provider.js";
import { createMemorySubsystem, loadMemoryConfig } from "./memory/index.js";
import { HeartbeatConfigStore } from "./reminders/heartbeat-config-store.js";
import { startHeartbeat } from "./reminders/heartbeat.js";
import { ChannelRegistry } from "./reminders/ports/channel-adapter.js";
import { ReminderStore } from "./reminders/store.js";
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
} from "./tools/index.js";

const logger = createPinoLogger({
	name: "sirimath-ai-agent",
	level: "info",
});

const memory = new Memory({
	storage: new LibSQLMemoryAdapter({
		url: "file:./.voltagent/memory.db",
		logger: logger.child({ component: "libsql" }),
	}),
});

const observability = new VoltAgentObservability({
	storage: new LibSQLObservabilityAdapter({
		url: "file:./.voltagent/observability.db",
	}),
});

const model = await resolveModel();
const voiceProvider = await resolveVoiceProvider(logger);

const memoryCfg = loadMemoryConfig();
const memorySubsystem = await createMemorySubsystem(memoryCfg, logger, model);

// Dedicated DB for reminders — separate from the memory subsystem's memory.db
const remindersDb = createClient({ url: "file:./.voltagent/reminders.db" });
const reminderStore = new ReminderStore(remindersDb);
await reminderStore.migrate();
const heartbeatCfgStore = new HeartbeatConfigStore(remindersDb);
await heartbeatCfgStore.migrate();
const channelRegistry = new ChannelRegistry();

const baseAgent = new Agent({
	name: "sirimath-ai-agent",
	instructions: `You are a helpful personal assistant accessible via Telegram currently.
Your Self-Identity:
- Name: Sirimath (pronounced "see-ree-math", means "A good boy" in Sinhala)
- Role: Personal assistant to the user. Help them with any tasks they have, and make their life easier.
- Your Creator: Chamara Dodandeniya
You can:
- Chat and answer questions on any topic
- Fetch real-time data from the internet using fetchUrl (REST APIs, JSON endpoints, plain-text pages)
- Get current real weather for any city using getWeather (powered by open-meteo.com, no API key needed)${webSearchEnabled ? "\n- Search the web for up-to-date information using webSearch" : ""}
- Discover and install agent skills from the skills.sh ecosystem
- Remember things across conversations using memory tools
- Set proactive reminders for tasks and follow-ups

When a user asks for current weather or weather in a city, use the getWeather tool.
When a user asks to fetch a URL or call an API, use the fetchUrl tool.${webSearchEnabled ? "\nWhen a user asks to search the web, look up news, or needs current information, use the webSearch tool." : ""}
When a user asks to find, discover, or search for skills, or says "how do I do X" where X might be an existing skill, use the findSkills tool and present the results with the security table shown.
When the user picks a skill number from the results, confirm any security warnings and then use the installSkill tool to install it.
When presenting skill search results, always show the full formatted table including security scores.
When the user asks what you remember about them, use the memoryViewProfile tool.
When the user asks to forget something, use the memoryForget tool.
When the user asks to export their memory, use the memoryExport tool.
When the user asks to erase all memory, use the memoryErase tool (requires confirmation).

When a user mentions a task, follow-up item, or anything they want to be reminded about:
1. Acknowledge the item naturally.
2. BEFORE ending your response, ask: "When should I remind you about this? For example: every 6 hours, daily at 9 AM, or in 3 days."
3. When the user replies with a cadence, call scheduleReminder with:
   - scheduleType: "recurring" for "every X", "daily" for "at X every day", "once" for specific time
   - intervalMs: hours * 3600000 or days * 86400000
   - timeOfDay: HH:mm 24h for daily (e.g. "09:00")
   - fireAt: ISO 8601 for once
   - userIdentity, channelId, channelUserId, conversationId from current context
4. Confirm the next fire time to the user.
5. If the user skips or says "don't remind me": do NOT call scheduleReminder.

When a user says "snooze [duration]" after a reminder:
- Call listReminders to get the most recent delivered reminder ID.
- Call snoozeReminder with that ID and snoozeMs (e.g. "2 hours" = 7200000; default = 3600000).

When a user says "done" / "completed" / "dismiss" / "ignore" after a reminder:
- Call listReminders to get the reminder ID.
- Call dismissReminder: markCompleted=true for "done"/"completed", false for "dismiss"/"ignore".

When a user asks to see their reminders: call listReminders.

When a user wants to configure quiet hours or daily digest (e.g. "only remind me between 8 AM and 10 PM on weekdays", "send me a daily digest at 9 AM"):
- Call configureHeartbeat with the appropriate quietHoursStart, quietHoursEnd, quietDays, digestEnabled, and digestTime values.
- Confirm the updated settings to the user.`,
	model,
	tools: [
		weatherTool,
		fetchUrlTool,
		...(webSearchEnabled ? [webSearchTool] : []),
		findSkillsTool,
		installSkillTool,
		...memorySubsystem.tools,
		createScheduleReminderTool(reminderStore),
		createSnoozeReminderTool(reminderStore),
		createDismissReminderTool(reminderStore),
		createListRemindersTool(reminderStore),
		createConfigureHeartbeatTool(heartbeatCfgStore),
	],
	memory,
});

const agent = memorySubsystem.wrap(baseAgent);

new VoltAgent({
	agents: {
		agent: baseAgent,
	},
	workflows: {},
	server: honoServer(),
	logger,
	observability,
	voltOpsClient: new VoltOpsClient({
		publicKey: process.env.VOLTAGENT_PUBLIC_KEY || "",
		secretKey: process.env.VOLTAGENT_SECRET_KEY || "",
	}),
});

// Register channel adapters before the heartbeat fires its startup tick
startTelegramBot(agent, logger, channelRegistry, voiceProvider);

const recovered = await reminderStore.recoverStaleDelivering();
if (recovered > 0) {
	logger.warn("[main] recovered stale delivering reminders", {
		count: recovered,
	});
}

const stopHeartbeat = startHeartbeat(
	reminderStore,
	heartbeatCfgStore,
	channelRegistry,
	logger,
	{
		cronExpression: process.env.HEARTBEAT_CRON ?? "* * * * *",
		quietHoursStart: process.env.HEARTBEAT_QUIET_START,
		quietHoursEnd: process.env.HEARTBEAT_QUIET_END,
	},
);

function shutdown(signal: string) {
	logger.info(`[main] received ${signal}, shutting down`);
	stopHeartbeat();
	memorySubsystem.stop();
	if (memorySubsystem.driver) {
		memorySubsystem.driver
			.close()
			.catch(() => {})
			.finally(() => process.exit(0));
	} else {
		process.exit(0);
	}
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
