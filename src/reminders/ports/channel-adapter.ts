export interface ChannelSendOptions {
	channelUserId: string;
	conversationId: string;
	text: string;
}

export interface ChannelAdapter {
	readonly channelId: string;
	send(opts: ChannelSendOptions): Promise<void>;
}

export class ChannelRegistry {
	private readonly adapters = new Map<string, ChannelAdapter>();
	register(adapter: ChannelAdapter): void {
		this.adapters.set(adapter.channelId, adapter);
	}
	get(channelId: string): ChannelAdapter | undefined {
		return this.adapters.get(channelId);
	}
	ids(): string[] {
		return [...this.adapters.keys()];
	}
}
