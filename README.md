<div align="center">
  <h1>⚡ sirimath-ai-agent</h1>
  <p>Personal AI assistant on Telegram — powered by <a href="https://voltagent.dev">VoltAgent</a> with BYOK multi-provider LLM support and self-extending skills.</p>

  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
  </p>
</div>

---

## What is this?

A Telegram bot that acts as your personal AI assistant. You bring your own LLM key (OpenAI, Anthropic, Google, Azure AI Foundry, Groq, Mistral, or local Ollama) — no vendor lock-in. The assistant can search the web, fetch live data, look up real-time weather, and discover + install new capabilities on demand from [skills.sh](https://skills.sh).

---

## Features

| Capability             | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| 💬 Telegram chat       | Full multi-turn conversations with persistent memory                       |
| 🔑 BYOK multi-provider | 7 LLM providers switchable via env vars, zero code changes                 |
| 🌐 Web access          | `fetchUrl` (HTTP GET any endpoint), optional `webSearch` (Brave or Tavily) |
| 🌤️ Real weather        | Live weather via open-meteo.com — no API key needed                        |
| 🔍 Skill discovery     | Search skills.sh and install new capabilities on demand                    |
| 🔒 Access control      | Optional allowlist via `ALLOWED_TELEGRAM_USER_IDS`                         |
| 📊 Observability       | VoltOps dashboard (local dev + production)                                 |

---

## Prerequisites

- **Node.js 22+**
- **Telegram bot token** — create one via [@BotFather](https://t.me/BotFather) (`/newbot`)
- **At least one LLM API key** (or Ollama running locally)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Edit .env — at minimum set these two:
#    TELEGRAM_BOT_TOKEN=...
#    OPENAI_API_KEY=...   (or any other provider)

# 4. Start in development mode
npm run dev
```

Open Telegram, find your bot by its handle, and send a message.

---

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and edit.

### Required

```env
# Your Telegram bot token from BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### LLM Provider (pick one)

| Provider         | `MODEL_PROVIDER` | Required env vars                      | Example `MODEL_ID`         |
| ---------------- | ---------------- | -------------------------------------- | -------------------------- |
| OpenAI           | `openai`         | `OPENAI_API_KEY`                       | `gpt-4o-mini`              |
| Anthropic        | `anthropic`      | `ANTHROPIC_API_KEY`                    | `claude-sonnet-4-20250514` |
| Google Gemini    | `google`         | `GOOGLE_GENERATIVE_AI_API_KEY`         | `gemini-2.0-flash-exp`     |
| Azure AI Foundry | `azure`          | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME` | `gpt-4o` (deployment name) |
| Groq             | `groq`           | `GROQ_API_KEY`                         | `llama-3.3-70b-versatile`  |
| Mistral          | `mistral`        | `MISTRAL_API_KEY`                      | `mistral-large-latest`     |
| Ollama (local)   | `ollama`         | _(none)_                               | `llama3.2`                 |

Default when nothing is set: `openai` / `gpt-4o-mini`.

```env
MODEL_PROVIDER=openai
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

> **Azure note**: For Azure AI Foundry, `MODEL_ID` is your **deployment name** (not the model family name). The agent uses the Chat Completions API explicitly to ensure compatibility with reasoning models (`o1`, `o3`, `gpt-5.x`) in multi-turn conversations.

### Telegram Options

```env
# "polling" for local dev, "webhook" for production server
TELEGRAM_MODE=polling

# Required only for webhook mode — must be a public HTTPS URL
# TELEGRAM_WEBHOOK_URL=https://yourserver.com/webhook

# Optional: restrict access to specific Telegram user IDs
# Get your ID from @userinfobot on Telegram
# ALLOWED_TELEGRAM_USER_IDS=123456789,987654321
```

### Web Search (optional)

Set **one** of the following to enable the `webSearch` tool:

```env
# Brave Search API — https://api.search.brave.com
# BRAVE_SEARCH_API_KEY=your-brave-search-api-key

# Tavily — designed for AI agents — https://tavily.com
# TAVILY_API_KEY=your-tavily-api-key
```

Without a search key, `fetchUrl` and `getWeather` still work fully.

### VoltOps Observability (optional)

```env
VOLTAGENT_PUBLIC_KEY=
VOLTAGENT_SECRET_KEY=
```

Leave empty to disable telemetry (nothing is sent). Get keys at [console.voltagent.dev](https://console.voltagent.dev/tracing-setup).

---

## Project Structure

```
sirimath-ai-agent/
├── src/
│   ├── index.ts                  # Agent bootstrap — model, tools, memory, Telegram
│   ├── channels/
│   │   └── telegram.ts           # Telegram adapter (grammy) — polling & webhook
│   ├── config/
│   │   └── model-provider.ts     # BYOK provider factory (resolveModel)
│   └── tools/
│       ├── index.ts              # Tool exports
│       ├── weather.ts            # getWeather — real data via open-meteo.com
│       ├── fetch-url.ts          # fetchUrl — HTTP GET any URL
│       ├── web-search.ts         # webSearch — Brave or Tavily (optional)
│       ├── find-skills.ts        # findSkills — search skills.sh
│       └── install-skill.ts      # installSkill — fetch & save SKILL.md
├── skills/                       # Installed skills (persisted across restarts)
├── specs/                        # Feature specifications
├── .voltagent/                   # Agent memory & observability DBs (SQLite)
├── .env.example                  # All env vars documented
├── Dockerfile                    # Production container
└── tsconfig.json
```

---

## Available Tools

The agent has these tools registered at runtime:

| Tool           | Trigger                           | Notes                                    |
| -------------- | --------------------------------- | ---------------------------------------- |
| `getWeather`   | "weather in [city]"               | open-meteo.com, no API key needed        |
| `fetchUrl`     | "fetch [url]" / "call this API"   | HTTP GET, returns up to 12KB             |
| `webSearch`    | "search for [topic]"              | Only active when a search API key is set |
| `findSkills`   | "find a skill for [topic]"        | Searches skills.sh, returns top 15       |
| `installSkill` | Pick a number from search results | Downloads SKILL.md to `./skills/`        |

---

## Skill Discovery

Skills are capabilities sourced from [skills.sh](https://skills.sh). You can discover and install them directly from Telegram:

```
You: find a skill for code review
Bot: [shows numbered list of matching skills]

You: 1
Bot: Installing "code-review" from anthropics/skills…
     ✅ Installed. Location: ./skills/code-review/
```

Installed skills are saved as SKILL.md files under `./skills/` and persist across restarts.

> **Note**: Installing a skill downloads its definition. For the agent to _execute_ the capability described by a skill, the relevant tool must also be implemented (e.g., web search requires `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY`).

---

## Running Scripts

```bash
npm run dev        # Development with hot reload (tsx watch)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled production build
npm run typecheck  # Type-check without emitting
npm run lint       # Biome lint check
npm run lint:fix   # Biome lint + auto-fix
```

---

## Docker Deployment

```bash
# Build
docker build -t sirimath-ai-agent .

# Run (pass your .env file)
docker run -p 3141:3141 --env-file .env sirimath-ai-agent
```

For webhook mode in production, set `TELEGRAM_MODE=webhook` and `TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook` in your environment. The Hono server listens on port 3141.

---

## VoltOps Observability

### Local Development

1. `npm run dev`
2. Visit [console.voltagent.dev](https://console.voltagent.dev)
3. The console auto-connects to `http://localhost:3141`

### Production

Configure `VOLTAGENT_PUBLIC_KEY` and `VOLTAGENT_SECRET_KEY` in your environment to send traces to the VoltOps cloud dashboard.

---

## Adding New Providers

Edit `src/config/model-provider.ts` and add a case to the switch:

```typescript
case "myprovider": {
  requireEnv("MYPROVIDER_API_KEY", "myprovider");
  const { createMyProvider } = await import("@ai-sdk/myprovider");
  return createMyProvider({ apiKey: process.env.MYPROVIDER_API_KEY })(modelId);
}
```

---

## Adding New Tools

Create a file in `src/tools/`, export from `src/tools/index.ts`, and add to the `tools` array in `src/index.ts`:

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const myTool = createTool({
  name: "myTool",
  description: "What this tool does — the model reads this",
  parameters: z.object({
    input: z.string().describe("The input parameter"),
  }),
  execute: async ({ input }) => {
    // Do something real here
    return { result: input.toUpperCase() };
  },
});
```

---

## Adding New Channels

Create a file under `src/channels/` (e.g. `slack.ts`, `whatsapp.ts`) that accepts the configured `agent` instance and a `logger`. The channel adapter should only translate between the messaging protocol and `agent.generateText()` — no agent logic, no tool definitions.

---

## Resources

- [VoltAgent Docs](https://voltagent.dev/docs/)
- [VoltAgent Examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- [skills.sh](https://skills.sh) — skill ecosystem
- [grammy Docs](https://grammy.dev) — Telegram Bot framework
- [open-meteo.com](https://open-meteo.com) — free weather API
- [VoltAgent Discord](https://s.voltagent.dev/discord)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
</div>

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Git
- OpenAI API Key (optional - can configure later)
  - Get your key at: https://platform.openai.com/api-keys

### Installation

```bash
# Clone the repository (if not created via create-voltagent-app)
git clone <your-repo-url>
cd sirimath-ai-agent

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Configuration

Edit `.env` file with your API keys:

```env
OPENAI_API_KEY=your-api-key-here

# VoltOps Platform (Optional)
# Get your keys at https://console.voltagent.dev/tracing-setup
# VOLTAGENT_PUBLIC_KEY=your-public-key
# VOLTAGENT_SECRET_KEY=your-secret-key
```

### Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## 🎯 Features

This VoltAgent application includes:

- **AI Agent**: Powered by OpenAI (GPT-4o-mini)
- **Workflows**: Pre-configured expense approval workflow
- **Memory**: Built-in conversation history
- **Tools**: Extensible tool system
- **Server**: Hono
- **Type Safety**: Full TypeScript support

## 🔍 VoltOps Platform

### Local Development

The VoltOps Platform provides real-time observability for your agents during development:

1. **Start your agent**: Run `npm run dev`
2. **Open console**: Visit [console.voltagent.dev](https://console.voltagent.dev)
3. **Auto-connect**: The console connects to your local agent at `http://localhost:3141`

Features:

- 🔍 Real-time execution visualization
- 🐛 Step-by-step debugging
- 📊 Performance insights
- 💾 No data leaves your machine

### Production Monitoring

For production environments, configure VoltOpsClient:

1. **Create a project**: Sign up at [console.voltagent.dev/tracing-setup](https://console.voltagent.dev/tracing-setup)
2. **Get your keys**: Copy your Public and Secret keys
3. **Add to .env**:
   ```env
   VOLTAGENT_PUBLIC_KEY=your-public-key
   VOLTAGENT_SECRET_KEY=your-secret-key
   ```
4. **Configure in code**: The template already includes VoltOpsClient setup!

## 📁 Project Structure

```
sirimath-ai-agent/
├── src/
│   ├── index.ts          # Main agent configuration
│   ├── tools/            # Custom tools
│   │   ├── index.ts      # Tool exports
│   │   └── weather.ts    # Weather tool example
│   └── workflows/        # Workflow definitions
│       └── index.ts      # Expense approval workflow
├── dist/                 # Compiled output (after build)
├── .env                  # Environment variables
├── .voltagent/           # Agent memory storage
├── Dockerfile            # Production deployment
├── package.json
└── tsconfig.json
```

## 🧪 Testing Workflows

The included expense approval workflow has test scenarios:

### Scenario 1: Auto-approved (< $500)

```json
{
  "employeeId": "EMP-123",
  "amount": 250,
  "category": "office-supplies",
  "description": "New laptop mouse and keyboard"
}
```

### Scenario 2: Manager approval required ($500-$5000)

```json
{
  "employeeId": "EMP-456",
  "amount": 3500,
  "category": "travel",
  "description": "Conference registration and hotel"
}
```

### Scenario 3: Director approval required (> $5000)

```json
{
  "employeeId": "EMP-789",
  "amount": 15000,
  "category": "equipment",
  "description": "New server hardware"
}
```

## 🐳 Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t sirimath-ai-agent .

# Run container
docker run -p 3141:3141 --env-file .env sirimath-ai-agent

# Or use docker-compose
docker-compose up
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run volt` - VoltAgent CLI tools

### Adding Custom Tools

Create new tools in `src/tools/`:

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const myTool = createTool({
  name: "myTool",
  description: "Description of what this tool does",
  input: z.object({
    param: z.string(),
  }),
  output: z.string(),
  handler: async ({ param }) => {
    // Tool logic here
    return `Result: ${param}`;
  },
});
```

### Creating New Workflows

Add workflows in `src/workflows/`:

```typescript
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";

export const myWorkflow = createWorkflowChain({
  id: "my-workflow",
  name: "My Custom Workflow",
  purpose: "Description of what this workflow does",
  input: z.object({
    data: z.string(),
  }),
  result: z.object({
    output: z.string(),
  }),
})
  .andThen({
    id: "process-data",
    execute: async ({ data }) => {
      // Process the input
      const processed = data.toUpperCase();
      return { processed };
    },
  })
  .andThen({
    id: "final-step",
    execute: async ({ data }) => {
      // Final transformation
      return { output: `Result: ${data.processed}` };
    },
  });
```

## 📚 Resources

- **Documentation**: [voltagent.dev/docs](https://voltagent.dev/docs/)
- **Examples**: [github.com/VoltAgent/voltagent/tree/main/examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- **Discord**: [Join our community](https://s.voltagent.dev/discord)
- **Blog**: [voltagent.dev/](https://voltagent.dev/blog/)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

---
