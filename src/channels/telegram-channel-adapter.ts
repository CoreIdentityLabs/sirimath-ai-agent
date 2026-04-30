import type { Bot } from "grammy";
import type {
	ChannelAdapter,
	ChannelSendOptions,
} from "../reminders/ports/channel-adapter.js";

export class TelegramChannelAdapter implements ChannelAdapter {
	readonly channelId = "telegram";
	constructor(private readonly bot: Bot) {}

	async send({ conversationId, text }: ChannelSendOptions): Promise<void> {
		await this.bot.api.sendMessage(conversationId, text);
	}
}
