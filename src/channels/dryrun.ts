/**
 * Dry-run stdin/stdout channel adapter.
 *
 * Proves SC-009: a new channel requires zero changes inside src/memory/.
 * Usage: `npm run dryrun -- alice` (channelNativeId becomes "dryrun:alice")
 *
 * Reads user messages from stdin line-by-line and writes agent replies to stdout.
 */
import * as readline from "node:readline";

export const CHANNEL_NAME = "dryrun" as const;

export async function startDryrunChannel(
	memoryAwareAgent: {
		generateText(args: {
			input: string;
			channel: string;
			channelUserId: string;
			conversationId: string;
		}): Promise<{ text: string }>;
	},
	userArg = "default",
): Promise<void> {
	const channelNativeUserId = `${CHANNEL_NAME}:${userArg}`;
	const conversationId = `${CHANNEL_NAME}-${userArg}-${Date.now()}`;

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false,
	});

	process.stdout.write(
		`[dryrun] Channel started. User: ${channelNativeUserId}\n`,
	);
	process.stdout.write(
		"[dryrun] Type a message and press Enter. Ctrl+C to quit.\n",
	);
	process.stdout.write("> ");

	for await (const line of rl) {
		const text = line.trim();
		if (!text) {
			process.stdout.write("> ");
			continue;
		}

		try {
			const result = await memoryAwareAgent.generateText({
				input: text,
				channel: CHANNEL_NAME,
				channelUserId: channelNativeUserId,
				conversationId,
			});
			process.stdout.write(`\n${result.text}\n\n> `);
		} catch (err) {
			process.stdout.write(`\n[error] ${(err as Error).message}\n\n> `);
		}
	}

	process.stdout.write("\n[dryrun] Session ended.\n");
}
