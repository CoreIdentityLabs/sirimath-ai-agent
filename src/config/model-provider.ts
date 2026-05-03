import type { LanguageModel } from "ai";

export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "groq",
  "mistral",
  "ollama",
  "lmstudio",
  "openai-compatible",
] as const;

export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

function requireEnv(name: string, provider: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[model-provider] Missing required environment variable: ${name} (required for MODEL_PROVIDER=${provider})`,
    );
    process.exit(1);
  }
  return value;
}

async function createOpenAICompatibleModel(options: {
  name: string;
  baseURL: string;
  modelId: string;
  apiKey?: string;
}): Promise<LanguageModel> {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const provider = createOpenAICompatible({
    name: options.name,
    baseURL: options.baseURL,
    apiKey: options.apiKey,
  });

  return provider(options.modelId);
}

export async function resolveModel(): Promise<LanguageModel> {
  const provider = (process.env.MODEL_PROVIDER ?? "openai") as ProviderName;
  const modelId = process.env.MODEL_ID ?? "gpt-4o-mini";

  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    console.error(
      `[model-provider] Unsupported MODEL_PROVIDER: "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
    process.exit(1);
  }

  switch (provider) {
    case "openai": {
      requireEnv("OPENAI_API_KEY", "openai");
      const { openai } = await import("@ai-sdk/openai");
      return openai(modelId);
    }

    case "anthropic": {
      requireEnv("ANTHROPIC_API_KEY", "anthropic");
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelId);
    }

    case "google": {
      requireEnv("GOOGLE_GENERATIVE_AI_API_KEY", "google");
      const { google } = await import("@ai-sdk/google");
      return google(modelId);
    }

    case "azure": {
      requireEnv("AZURE_API_KEY", "azure");
      const resourceName = requireEnv("AZURE_RESOURCE_NAME", "azure");
      const { createAzure } = await import("@ai-sdk/azure");
      const azureProvider = createAzure({
        resourceName,
        apiKey: process.env.AZURE_API_KEY,
      });
      // Use .chat() explicitly to force the Chat Completions API.
      // The default azureProvider(modelId) uses the Responses API, which stores
      // reasoning tokens server-side. VoltAgent's memory reconstruction omits those
      // tokens, causing Azure to return HTTP 400 on subsequent turns.
      return azureProvider.chat(modelId);
    }

    case "groq": {
      requireEnv("GROQ_API_KEY", "groq");
      const { groq } = await import("@ai-sdk/groq");
      return groq(modelId);
    }

    case "mistral": {
      requireEnv("MISTRAL_API_KEY", "mistral");
      const { mistral } = await import("@ai-sdk/mistral");
      return mistral(modelId);
    }

    case "ollama": {
      const { ollama } = await import("ollama-ai-provider-v2");
      return ollama(modelId);
    }

    case "lmstudio": {
      return createOpenAICompatibleModel({
        name: "lmstudio",
        baseURL: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
        modelId,
      });
    }

    case "openai-compatible": {
      const baseURL = requireEnv(
        "OPENAI_COMPATIBLE_BASE_URL",
        "openai-compatible",
      );
      return createOpenAICompatibleModel({
        name: process.env.OPENAI_COMPATIBLE_NAME ?? "openai-compatible",
        baseURL,
        modelId,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      });
    }
  }
}
