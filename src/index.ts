import "dotenv/config";
import { createClient } from "@libsql/client";
import {
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
import { createBaseAgent } from "./agents/base-agent.js";
import { startTelegramBot } from "./channels/telegram.js";
import { resolveModel } from "./config/model-provider.js";
import { resolveVoiceProvider } from "./config/voice-provider.js";
import { createMemorySubsystem, loadMemoryConfig } from "./memory/index.js";
import { HeartbeatConfigStore } from "./reminders/heartbeat-config-store.js";
import { startHeartbeat } from "./reminders/heartbeat.js";
import { ChannelRegistry } from "./reminders/ports/channel-adapter.js";
import { ReminderStore } from "./reminders/store.js";

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

const baseAgent = createBaseAgent({
  model,
  memory,
  memoryTools: memorySubsystem.tools,
  reminderStore,
  heartbeatCfgStore,
});

const agent = memorySubsystem.wrap(baseAgent);

new VoltAgent({
  agents: {
    baseAgent: baseAgent,
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
