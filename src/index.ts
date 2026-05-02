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
import { createBackgroundAgent } from "./agents/background-agent.js";
import { createBaseAgent } from "./agents/base-agent.js";
import { startTelegramBot } from "./channels/telegram.js";
import { resolveModel } from "./config/model-provider.js";
import { resolveVoiceProvider } from "./config/voice-provider.js";
import { createMemorySubsystem, loadMemoryConfig } from "./memory/index.js";
import { BackgroundExecutionStore } from "./reminders/background-execution-store.js";
import { BackgroundRunner } from "./reminders/background-runner.js";
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
const backgroundExecutionStore = new BackgroundExecutionStore(remindersDb);
await backgroundExecutionStore.migrate();
const channelRegistry = new ChannelRegistry();

const rawIds = process.env.ALLOWED_TELEGRAM_USER_IDS ?? "";
const allowedTelegramUserIds: Set<string> = rawIds.trim()
  ? new Set(
      rawIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
  : new Set();

const baseAgent = createBaseAgent({
  model,
  memory,
  memoryTools: memorySubsystem.tools,
  reminderStore,
  heartbeatCfgStore,
});

const backgroundAgent = createBackgroundAgent({
  model,
  memory,
  memoryTools: memorySubsystem.tools,
  reminderStore,
  heartbeatCfgStore,
});

const agent = memorySubsystem.wrap(baseAgent);
const backgroundMemoryAgent = memorySubsystem.wrap(backgroundAgent);

const backgroundRunner = new BackgroundRunner({
  agent: backgroundMemoryAgent,
  executionStore: backgroundExecutionStore,
  reminderStore,
  registry: channelRegistry,
  log: logger,
  timeoutMs: Number(process.env.BACKGROUND_RUN_TIMEOUT_MS ?? 45_000),
  allowedChannelUserIds: allowedTelegramUserIds,
});

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

const recoveredBackground =
  await backgroundExecutionStore.recoverStaleRunning();
if (recoveredBackground > 0) {
  logger.warn("[main] recovered stale background executions", {
    count: recoveredBackground,
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
    backgroundRunner,
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
