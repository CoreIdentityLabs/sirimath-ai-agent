import type { Agent } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";
import { ulid } from "ulid";
import type { Extractor } from "./extract/extractor.js";
import type { IdentityStore } from "./ports/identity-store.js";
import type { MemoryStore } from "./ports/memory-store.js";
import type {
	ExtractedItem,
	ExtractedRelationship,
	MemoryItem,
	Relationship,
	RetrievalBundle,
} from "./schema.js";

export interface MemoryAwareAgentDeps {
	inner: Agent;
	identity: IdentityStore;
	store: MemoryStore;
	extract: Extractor;
	log: Logger;
	onUserContextResolved?: (context: {
		userIdentity: string;
		channel: string;
		channelUserId: string;
		conversationId: string;
	}) => void;
}

export interface MemoryAwareAgentArgs {
	input: string;
	channel: string;
	channelUserId: string;
	conversationId: string;
}

function formatMemoryLines(items: MemoryItem[]): string[] {
	return items.map((i) => {
		const since = i.validFrom.toISOString().split("T")[0];
		return `- [${i.type}] ${i.description} (known since ${since})`;
	});
}

function formatRetrievalForPrompt(bundle: RetrievalBundle): string {
	const sections: string[] = [];

	if (bundle.profile) {
		const profileLines = [
			bundle.profile.displayName
				? `- Name: ${bundle.profile.displayName}`
				: null,
			bundle.profile.timezone ? `- Timezone: ${bundle.profile.timezone}` : null,
			bundle.profile.locale ? `- Locale: ${bundle.profile.locale}` : null,
			bundle.profile.homeLocation
				? `- Home location: ${bundle.profile.homeLocation}`
				: null,
			bundle.profile.summary ? `- Summary: ${bundle.profile.summary}` : null,
			...Object.entries(bundle.profile.preferences).map(
				([key, value]) => `- Preference ${key}: ${String(value)}`,
			),
		].filter(Boolean);

		if (profileLines.length > 0) {
			sections.push(`[Known User Profile]\n${profileLines.join("\n")}`);
		}
	}

	if (bundle.matchedItems.length > 0) {
		sections.push(
			`[Relevant Long-Term Memories]\n${formatMemoryLines(bundle.matchedItems).join("\n")}`,
		);
	}

	if (bundle.recentItems.length > 0) {
		sections.push(
			`[Recent Context]\n${formatMemoryLines(bundle.recentItems).join("\n")}`,
		);
	}

	if (sections.length === 0) return "";
	return `${sections.join("\n\n")}\n\n`;
}

async function ingestExtracted(
	store: MemoryStore,
	userIdentity: string,
	items: (ExtractedItem & { itemId: string })[],
	rels: (ExtractedRelationship & { relationshipId: string })[],
	conversationId: string,
): Promise<void> {
	const now = new Date();
	for (const it of items) {
		const item: MemoryItem = {
			itemId: it.itemId,
			userIdentity,
			type: it.type,
			description: it.description,
			salience: it.type === "preference" || it.type === "decision" ? 0.85 : 0.6,
			validFrom: now,
			validUntil: null,
			sourceConversationId: conversationId,
			redacted: false,
			accessCount: 0,
			lastAccessedAt: null,
			createdAt: now,
		};
		await store.addMemoryItem(item);
	}

	// Build a description → itemId map so we can resolve relationship endpoints.
	const descToId = new Map(items.map((it) => [it.description, it.itemId]));
	for (const r of rels) {
		const fromItemId = descToId.get(r.fromDescription);
		const toItemId = descToId.get(r.toDescription);
		// Skip if either endpoint can't be resolved to a persisted item.
		if (!fromItemId || !toItemId) continue;
		const rel: Relationship = {
			relationshipId: r.relationshipId,
			fromItemId,
			toItemId,
			type: r.type,
			description: r.description,
			confidence: 1,
			userIdentity,
			createdAt: now,
		};
		await store.addRelationship(rel);
	}
}

export function createMemoryAwareAgent(deps: MemoryAwareAgentDeps) {
	const { inner, identity, store, extract, log } = deps;

	return {
		async generateText(args: MemoryAwareAgentArgs): Promise<{ text: string }> {
			const t0 = Date.now();
			const userIdentity = await identity.resolveOrCreate(
				args.channel,
				args.channelUserId,
			);

			deps.onUserContextResolved?.({
				userIdentity,
				channel: args.channel,
				channelUserId: args.channelUserId,
				conversationId: args.conversationId,
			});

			// Retrieve relevant memories and prepend as context.
			let memoryBlock = "";
			try {
				const bundle = await store.retrieveContext(userIdentity, args.input, {
					matchedLimit: 12,
					recentLimit: 5,
				});
				memoryBlock = formatRetrievalForPrompt(bundle);
			} catch (err) {
				log.warn("[memory] retrieve failed — proceeding without context", {
					err,
					userIdentity,
				});
			}

			// Check for unresolved contradictions and surface proactively.
			let contradictionNotice = "";
			try {
				const reports = await store.listConsolidationReports(userIdentity, 1);
				const latest = reports[0];
				if (latest && latest.contradictionsDetected.length > 0) {
					contradictionNotice = `[Memory notice] I have conflicting information about you on the following:\n${latest.contradictionsDetected
						.map((c) => `- ${c.reason}`)
						.join("\n")}\nPlease let me know which is correct.\n\n`;
				}
			} catch {
				// Non-critical — do not block the reply.
			}

			const augmentedInput = `${contradictionNotice}${memoryBlock}${args.input}`;

			const result = await inner.generateText(augmentedInput, {
				userId: userIdentity,
				conversationId: args.conversationId,
				context: {
					channel: args.channel,
					channelNativeId: args.channelUserId,
				},
			});

			const responseText = result.text;

			log.debug("[memory] facade turn complete", {
				userIdentity,
				conversationId: args.conversationId,
				durationMs: Date.now() - t0,
			});

			// Fire-and-forget extraction — never block the reply.
			// Use a per-turn ULID as the record ID so each message gets its own
			// ConversationRecord instead of overwriting the same chat-level node.
			const recordId = ulid();
			void extract(userIdentity, args.input, responseText, args.conversationId)
				.then(async ({ profilePatch, items, relationships }) => {
					const hasProfilePatch = Object.keys(profilePatch).length > 0;
					if (
						!hasProfilePatch &&
						items.length === 0 &&
						relationships.length === 0
					) {
						return;
					}

					if (hasProfilePatch) {
						await store.upsertProfile(userIdentity, profilePatch);
					}

					await ingestExtracted(
						store,
						userIdentity,
						items,
						relationships,
						recordId,
					);

					// Persist conversation record.
					await store.persistConversationRecord({
						conversationId: recordId,
						userIdentity,
						channel: args.channel,
						startedAt: new Date(),
						endedAt: new Date(),
						transcript: [
							{ at: new Date(), role: "user", content: args.input },
							{ at: new Date(), role: "assistant", content: responseText },
						],
					});
				})
				.catch((err) =>
					log.warn("[memory] ingest failed", { err, userIdentity }),
				);

			return { text: responseText };
		},
	};
}
