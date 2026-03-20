import { BaseVoiceProvider } from "@voltagent/voice";
import type { ReadableStreamType } from "@voltagent/voice";
import { AzureOpenAI } from "openai";
import { Readable } from "node:stream";

type AzureVoice =
	| "alloy"
	| "echo"
	| "fable"
	| "onyx"
	| "nova"
	| "shimmer"
	| "ash"
	| "coral"
	| "sage";

interface AzureVoiceProviderOptions {
	apiKey: string;
	resourceName: string;
	speechModel?: string;
	ttsModel?: string;
	voice?: AzureVoice;
}

export class AzureVoiceProvider extends BaseVoiceProvider {
	private readonly client: AzureOpenAI;
	private readonly speechModel: string;
	private readonly ttsModel: string;
	private readonly voice: AzureVoice;

	constructor(options: AzureVoiceProviderOptions) {
		super({ apiKey: options.apiKey });
		this.client = new AzureOpenAI({
			apiKey: options.apiKey,
			endpoint: `https://${options.resourceName}.openai.azure.com/`,
			apiVersion: "2024-02-01",
		});
		this.speechModel = options.speechModel ?? "whisper-1";
		this.ttsModel = options.ttsModel ?? "tts-1";
		this.voice = options.voice ?? "alloy";
	}

	async speak(
		text: string | NodeJS.ReadableStream,
	): Promise<NodeJS.ReadableStream> {
		const inputText =
			typeof text === "string"
				? text
				: await streamToString(text as NodeJS.ReadableStream);

		const response = await this.client.audio.speech.create({
			model: this.ttsModel,
			voice: this.voice as any, // AzureVoice is a string union; OpenAI SDK expects SpeechCreateParams voice
			input: inputText,
		});

		const arrayBuffer = await response.arrayBuffer();
		return Readable.from(Buffer.from(arrayBuffer));
	}

	async listen(
		audio: NodeJS.ReadableStream,
	): Promise<string | ReadableStreamType> {
		const chunks: Buffer[] = [];
		for await (const chunk of audio) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const buffer = Buffer.concat(chunks);

		const file = new File([buffer], "audio.ogg", { type: "audio/ogg" });
		const transcription = await this.client.audio.transcriptions.create({
			model: this.speechModel,
			file,
		});
		return transcription.text;
	}

	// Stub implementations for real-time voice (not used in this feature)
	async connect(): Promise<void> {}
	disconnect(): void {}
	async send(): Promise<void> {}
	async getVoices(): Promise<
		Array<{
			id: string;
			name: string;
			language: string;
			gender?: "male" | "female" | "neutral";
		}>
	> {
		return [];
	}
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf-8");
}
