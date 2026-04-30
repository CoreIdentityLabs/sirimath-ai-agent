import "dotenv/config";
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
import { startTelegramBot } from "./channels/telegram";
import { resolveModel } from "./config/model-provider";
import { resolveVoiceProvider } from "./config/voice-provider";
import { createMemorySubsystem, loadMemoryConfig } from "./memory/index.js";
import {
  fetchUrlTool,
  findSkillsTool,
  installSkillTool,
  weatherTool,
  webSearchEnabled,
  webSearchTool,
} from "./tools";

// Create a logger instance
const logger = createPinoLogger({
  name: "sirimath-ai-agent",
  level: "info",
});

// Configure persistent memory (LibSQL / SQLite)
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    url: "file:./.voltagent/memory.db",
    logger: logger.child({ component: "libsql" }),
  }),
});

// Configure persistent observability (LibSQL / SQLite)
const observability = new VoltAgentObservability({
  storage: new LibSQLObservabilityAdapter({
    url: "file:./.voltagent/observability.db",
  }),
});

const model = await resolveModel();
const voiceProvider = await resolveVoiceProvider(logger);

// Bootstrap long-term memory subsystem (Neo4j-backed; degrades gracefully if unconfigured).
const memoryCfg = loadMemoryConfig();
const memorySubsystem = await createMemorySubsystem(memoryCfg, logger, model);

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

When a user asks for current weather or weather in a city, use the getWeather tool.
When a user asks to fetch a URL or call an API, use the fetchUrl tool.${webSearchEnabled ? "\nWhen a user asks to search the web, look up news, or needs current information, use the webSearch tool." : ""}
When a user asks to find, discover, or search for skills, or says "how do I do X" where X might be an existing skill, use the findSkills tool and present the results with the security table shown.
When the user picks a skill number from the results, confirm any security warnings and then use the installSkill tool to install it.
When presenting skill search results, always show the full formatted table including security scores.
When the user asks what you remember about them, use the memoryViewProfile tool.
When the user asks to forget something, use the memoryForget tool.
When the user asks to export their memory, use the memoryExport tool.
When the user asks to erase all memory, use the memoryErase tool (requires confirmation).`,
  model,
  tools: [
    weatherTool,
    fetchUrlTool,
    ...(webSearchEnabled ? [webSearchTool] : []),
    findSkillsTool,
    installSkillTool,
    ...memorySubsystem.tools,
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

// Graceful shutdown — drain Neo4j bolt connections before exit (T052).
function shutdown(signal: string) {
  logger.info(`[main] received ${signal}, shutting down`);
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

startTelegramBot(agent, logger, voiceProvider);
