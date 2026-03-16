# Quickstart: Telegram BYOK Personal Assistant

## Prerequisites

- Node.js ≥ 20
- A Telegram bot token from [BotFather](https://t.me/BotFather)
- At least one LLM provider API key (default: OpenAI)

## 1. Install Dependencies

```bash
npm install grammy @ai-sdk/openai
```

For additional providers (install only what you need):

```bash
npm install @ai-sdk/anthropic    # Anthropic Claude
npm install @ai-sdk/google       # Google Gemini
npm install @ai-sdk/azure        # Azure AI Foundry
npm install @ai-sdk/groq         # Groq
npm install @ai-sdk/mistral      # Mistral
npm install ollama-ai-provider-v2 # Ollama (local)
```

## 2. Configure Environment

Create `.env` from the example:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Required
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# LLM Provider (default: openai/gpt-4o-mini)
MODEL_PROVIDER=openai
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=sk-...

# Optional: restrict access
# ALLOWED_TELEGRAM_USER_IDS=123456789,987654321

# Optional: VoltOps observability
# VOLTAGENT_PUBLIC_KEY=...
# VOLTAGENT_SECRET_KEY=...
```

### Azure AI Foundry Configuration

```bash
MODEL_PROVIDER=azure
MODEL_ID=gpt-4o                    # Your Azure deployment name
AZURE_RESOURCE_NAME=my-resource    # Azure OpenAI resource name
AZURE_API_KEY=your-azure-key
```

## 3. Run

```bash
npm run dev
```

The bot starts in Telegram long-polling mode. Open Telegram, find your bot, and send a message.

## 4. Switch Providers

Change `MODEL_PROVIDER` and `MODEL_ID` in `.env` and restart:

```bash
# Anthropic
MODEL_PROVIDER=anthropic
MODEL_ID=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
MODEL_PROVIDER=google
MODEL_ID=gemini-2.0-flash
GOOGLE_GENERATIVE_AI_API_KEY=...

# Ollama (local, no API key)
MODEL_PROVIDER=ollama
MODEL_ID=llama3.2
```

## 5. Discover Skills

Send a message to your Telegram bot:

> "Find a skill for react best practices"

The bot will search skills.sh, show results with security scores, and let you pick one to install.

## 6. Production (Webhook Mode)

```bash
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-domain.com/telegram/webhook
```

Deploy via Docker:

```bash
docker build -t sirimath-ai-agent .
docker run -d --env-file .env sirimath-ai-agent
```
