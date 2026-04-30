import type { Voice } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";

const SUPPORTED_VOICE_PROVIDERS = ["openai", "azure"] as const;
type VoiceProviderName = (typeof SUPPORTED_VOICE_PROVIDERS)[number];

export async function resolveVoiceProvider(
	logger: Logger,
): Promise<Voice | null> {
	const providerName = process.env.VOICE_PROVIDER?.toLowerCase().trim();

	if (!providerName) {
		logger.info(
			"[voice-provider] VOICE_PROVIDER not set — voice features disabled",
		);
		return null;
	}

	if (
		!(SUPPORTED_VOICE_PROVIDERS as readonly string[]).includes(providerName)
	) {
		logger.warn(
			`[voice-provider] Unsupported VOICE_PROVIDER: '${providerName}'. Supported: ${SUPPORTED_VOICE_PROVIDERS.join(", ")}. Falling back to text-only.`,
		);
		return null;
	}

	switch (providerName as VoiceProviderName) {
		case "openai": {
			const apiKey = process.env.OPENAI_API_KEY;
			if (!apiKey) {
				logger.error(
					"[voice-provider] VOICE_PROVIDER=openai but OPENAI_API_KEY is not set. Voice disabled.",
				);
				return null;
			}
			const { OpenAIVoiceProvider } = await import("@voltagent/voice");
			const provider = new OpenAIVoiceProvider({
				apiKey,
				speechModel: process.env.STT_MODEL || "whisper-1",
				ttsModel: process.env.TTS_MODEL || "tts-1",
				// biome-ignore lint/suspicious/noExplicitAny: OpenAIVoice is a string union; env var is untyped
				voice: (process.env.TTS_VOICE || "alloy") as any,
			});
			const sttModel = process.env.STT_MODEL || "whisper-1";
			const ttsModel = process.env.TTS_MODEL || "tts-1";
			const ttsVoice = process.env.TTS_VOICE || "alloy";
			logger.info(
				`[voice-provider] Voice provider initialized: openai | STT: ${sttModel} | TTS: ${ttsModel} | voice: ${ttsVoice}`,
			);
			return provider;
		}

		case "azure": {
			const apiKey = process.env.AZURE_API_KEY;
			const resourceName = process.env.AZURE_RESOURCE_NAME;
			if (!apiKey || !resourceName) {
				const missingVar = !apiKey ? "AZURE_API_KEY" : "AZURE_RESOURCE_NAME";
				logger.error(
					`[voice-provider] VOICE_PROVIDER=azure but ${missingVar} is not set. Voice disabled.`,
				);
				return null;
			}
			// Azure requires explicit deployment names — model names like "whisper-1" are NOT valid
			const sttModel = process.env.STT_MODEL;
			const ttsModel = process.env.TTS_MODEL;
			if (!sttModel) {
				logger.error(
					"[voice-provider] VOICE_PROVIDER=azure requires STT_MODEL to be set to your Azure Whisper deployment name (e.g. STT_MODEL=my-whisper-deployment). Voice disabled.",
				);
				return null;
			}
			if (!ttsModel) {
				logger.error(
					"[voice-provider] VOICE_PROVIDER=azure requires TTS_MODEL to be set to your Azure TTS deployment name (e.g. TTS_MODEL=my-tts-deployment). Voice disabled.",
				);
				return null;
			}
			const { AzureVoiceProvider } = await import(
				"../voice/azure-voice-provider"
			);
			const ttsVoice = process.env.TTS_VOICE || "alloy";
			const provider = new AzureVoiceProvider({
				apiKey,
				resourceName,
				speechModel: sttModel,
				ttsModel,
				// biome-ignore lint/suspicious/noExplicitAny: OpenAIVoice is a string union; env var is untyped
				voice: ttsVoice as any,
			});
			logger.info(
				`[voice-provider] Voice provider initialized: azure | STT: ${sttModel} | TTS: ${ttsModel} | voice: ${ttsVoice}`,
			);
			return provider;
		}
	}
}
