import type { Agent, Voice } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";
import { Bot, Context, InputFile } from "grammy";
import { Readable } from "node:stream";

function splitMessage(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];

	// Split on paragraph boundaries first
	const paragraphs = text.split(/\n\n+/);
	let current = "";

	for (const paragraph of paragraphs) {
		const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
		if (candidate.length <= maxLen) {
			current = candidate;
		} else if (current) {
			chunks.push(current);
			current = paragraph;
		} else {
			// Single paragraph exceeds limit — split by line
			const lines = paragraph.split(/\n/);
			let lineCurrent = "";
			for (const line of lines) {
				const lineCandidate = lineCurrent ? `${lineCurrent}\n${line}` : line;
				if (lineCandidate.length <= maxLen) {
					lineCurrent = lineCandidate;
				} else if (lineCurrent) {
					chunks.push(lineCurrent);
					lineCurrent = line;
				} else {
					// Single line exceeds limit — split by words
					const words = line.split(" ");
					let wordCurrent = "";
					for (const word of words) {
						const wordCandidate = wordCurrent ? `${wordCurrent} ${word}` : word;
						if (wordCandidate.length <= maxLen) {
							wordCurrent = wordCandidate;
						} else {
							if (wordCurrent) chunks.push(wordCurrent);
							wordCurrent =
								word.length <= maxLen ? word : word.slice(0, maxLen);
						}
					}
					if (wordCurrent) lineCurrent = wordCurrent;
				}
			}
			if (lineCurrent) current = lineCurrent;
		}
	}
	if (current) chunks.push(current);
	return chunks.filter((c) => c.trim().length > 0);
}

export async function startTelegramBot(
	agent: Agent,
	logger: Logger,
	voiceProvider?: Voice | null,
): Promise<void> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		logger.error(
			"[telegram] Missing required TELEGRAM_BOT_TOKEN environment variable",
		);
		process.exit(1);
	}

	const mode = (process.env.TELEGRAM_MODE ?? "polling").toLowerCase();

	// Parse allowed user IDs into a Set for O(1) lookup
	const rawIds = process.env.ALLOWED_TELEGRAM_USER_IDS ?? "";
	const allowedIds: Set<string> = rawIds.trim()
		? new Set(
				rawIds
					.split(",")
					.map((id) => id.trim())
					.filter(Boolean),
			)
		: new Set();

	const bot = new Bot(token);

	// Shared voice processing pipeline: download → STT → agent → TTS reply + text
	async function processVoiceMessage(
		ctx: Context,
		fileId: string,
	): Promise<void> {
		const userId = ctx.from?.id?.toString() ?? "unknown";
		const conversationId = ctx.chat?.id.toString() ?? "unknown";

		// Access control
		if (allowedIds.size > 0 && !allowedIds.has(userId)) {
			logger.warn("[telegram] Unauthorized voice access attempt", { userId });
			await ctx.reply("Sorry, you don't have access to this assistant.");
			return;
		}

		logger.info("[telegram] Received voice message", { userId, conversationId, fileId });

		// Download voice file from Telegram
		let audioBuffer: Buffer;
		try {
			const file = await ctx.api.getFile(fileId);
			const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
			const response = await fetch(fileUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} downloading voice file`);
			}
			audioBuffer = Buffer.from(await response.arrayBuffer());
		} catch (err) {
			logger.error("[telegram] Failed to download voice file", { err, userId, fileId });
			await ctx.reply("Sorry, I couldn't download your voice message. Please try again.");
			return;
		}

		// STT: Buffer → ReadableStream → transcribed text
		let transcript: string;
		try {
			const audioStream = Readable.from(audioBuffer);
			const sttResult = await voiceProvider!.listen(audioStream);
			transcript = typeof sttResult === "string" ? sttResult : "";
		} catch (err) {
			logger.error("[telegram] STT transcription failed", { err, userId });
			await ctx.reply("Sorry, I couldn't transcribe your voice message. Please try again or send a text message.");
			return;
		}

		if (!transcript.trim()) {
			logger.warn("[telegram] Empty transcript from voice message", { userId });
			await ctx.reply("I couldn't make out what you said. Please try again with a clearer recording.");
			return;
		}

		logger.info("[telegram] Voice transcribed", { userId, transcriptLen: transcript.length });

		// Process through agent
		let responseText: string;
		try {
			const result = await agent.generateText(transcript, { userId, conversationId });
			responseText =
				typeof result === "string"
					? result
					: ((result as { text?: string }).text ?? String(result));
		} catch (err) {
			logger.error("[telegram] Agent error processing voice transcript", { err, userId });
			await ctx.reply("Something went wrong while processing your message. Please try again.");
			return;
		}

		// TTS: generate voice reply and send alongside text follow-up
		let ttsSucceeded = false;
		try {
			const ttsStream = await voiceProvider!.speak(responseText);
			const chunks: Buffer[] = [];
			for await (const chunk of ttsStream) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			}
			const ttsBuffer = Buffer.concat(chunks);
			await ctx.replyWithVoice(new InputFile(ttsBuffer, "reply.ogg"));
			ttsSucceeded = true;
		} catch (err) {
			logger.warn("[telegram] TTS failed, falling back to text-only reply", { err, userId });
		}

		// Always send text follow-up (FR-006: text accompanies voice reply; also fallback when TTS fails)
		const textChunks = splitMessage(responseText, 4096);
		for (const chunk of textChunks) {
			await ctx.reply(chunk);
		}

		if (!ttsSucceeded) {
			logger.info("[telegram] Delivered text-only reply (TTS unavailable)", { userId });
		}
	}

	// Register voice handlers BEFORE text handler and fallback (grammy routing order matters)
	if (voiceProvider) {
		bot.on("message:voice", async (ctx) => {
			await processVoiceMessage(ctx, ctx.message.voice.file_id);
		});

		bot.on("message:audio", async (ctx) => {
			await processVoiceMessage(ctx, ctx.message.audio.file_id);
		});
	}

	// Handle text messages
	bot.on("message:text", async (ctx) => {
		const userId = ctx.from?.id?.toString() ?? "unknown";
		const conversationId = ctx.chat.id.toString();
		const text = ctx.message.text;

		// Access control
		if (allowedIds.size > 0 && !allowedIds.has(userId)) {
			logger.warn("[telegram] Unauthorized access attempt", { userId });
			await ctx.reply("Sorry, you don't have access to this assistant.");
			return;
		}

		logger.info("[telegram] Received message", {
			userId,
			conversationId,
			msgLen: text.length,
		});

		try {
			const result = await agent.generateText(text, {
				userId,
				conversationId,
			});

			const responseText =
				typeof result === "string"
					? result
					: ((result as { text?: string }).text ?? String(result));

			const chunks = splitMessage(responseText, 4096);
			for (const chunk of chunks) {
				await ctx.reply(chunk);
			}
		} catch (err) {
			logger.error("[telegram] Error generating response", {
				err,
				userId,
				conversationId,
			});
			await ctx.reply(
				"Something went wrong while processing your message. Please try again.",
			);
		}
	});

	// Fallback: non-text messages
	bot.on("message", async (ctx) => {
		await ctx.reply(
			voiceProvider
				? "I support text messages and voice notes. Please send me a text or voice message."
				: "I currently support text messages only. Please send me a text message.",
		);
	});

	// Global error handler
	bot.catch((err) => {
		logger.error("[telegram] Unhandled bot error", { err: err.error });
	});

	if (mode === "webhook") {
		const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
		if (!webhookUrl) {
			logger.error(
				"[telegram] TELEGRAM_MODE=webhook but TELEGRAM_WEBHOOK_URL is not set",
			);
			process.exit(1);
		}
		await bot.api.setWebhook(webhookUrl);
		logger.info("[telegram] Webhook registered", { webhookUrl });
		// Webhook handling is done via the Hono server — bot.init() readies internal state
		await bot.init();
	} else {
		logger.info("[telegram] Starting bot in long-polling mode");
		bot.start({
			onStart: (info) => {
				logger.info("[telegram] Bot started", { username: info.username });
			},
		});
	}
}
