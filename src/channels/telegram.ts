import type { Agent } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";
import { Bot } from "grammy";

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
			"I currently support text messages only. Please send me a text message.",
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
