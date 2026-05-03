import type { Bot } from "grammy";
import type {
  ChannelAdapter,
  ChannelSendOptions,
} from "../reminders/ports/channel-adapter.js";

export function splitTelegramMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    const lines = paragraph.split(/\n/);
    let lineCurrent = "";
    for (const line of lines) {
      const lineCandidate = lineCurrent ? `${lineCurrent}\n${line}` : line;
      if (lineCandidate.length <= maxLen) {
        lineCurrent = lineCandidate;
        continue;
      }

      if (lineCurrent) chunks.push(lineCurrent);
      lineCurrent = "";

      const words = line.split(" ");
      let wordCurrent = "";
      for (const word of words) {
        const wordCandidate = wordCurrent ? `${wordCurrent} ${word}` : word;
        if (wordCandidate.length <= maxLen) {
          wordCurrent = wordCandidate;
        } else {
          if (wordCurrent) chunks.push(wordCurrent);
          wordCurrent = word.length <= maxLen ? word : word.slice(0, maxLen);
        }
      }
      if (wordCurrent) lineCurrent = wordCurrent;
    }

    if (lineCurrent) current = lineCurrent;
  }

  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channelId = "telegram";
  constructor(private readonly bot: Bot) {}

  async send({ conversationId, text }: ChannelSendOptions): Promise<void> {
    if (!/^-?\d+$/.test(conversationId)) {
      throw new Error(
        `Invalid Telegram chat ID for delivery: ${conversationId}`,
      );
    }

    const chunks = splitTelegramMessage(text);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(conversationId, chunk);
    }
  }
}
