import type { Agent } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";
import { ulid } from "ulid";
import { loadLlmLimitConfig } from "../config/llm-limits.js";
import type { MemoryEmbeddingProvider } from "./embedding-provider.js";
import type { Extractor } from "./extract/extractor.js";
import type { IdentityStore } from "./ports/identity-store.js";
import type { MemoryStore } from "./ports/memory-store.js";
import type {
	ConversationRecordKind,
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
	embeddingProvider: MemoryEmbeddingProvider | null;
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
	executionKind?: ConversationRecordKind;
	includeRecentMemory?: boolean;
	persistConversation?: boolean;
	persistExtractedMemory?: boolean;
}

interface MemoryAwareTextStreamResult {
	textStream: AsyncIterable<string>;
	text: Promise<string>;
}

const APPROX_CHARS_PER_TOKEN = 4;

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

function fitTextToTokenBudget(
	text: string,
	tokenBudget: number | null,
): string {
	if (!text || !tokenBudget) return text;

	const maxChars = tokenBudget * APPROX_CHARS_PER_TOKEN;
	if (text.length <= maxChars) return text;

	return `${text.slice(0, maxChars).trimEnd()}\n\n`;
}

async function ingestExtracted(
	store: MemoryStore,
	embeddingProvider: MemoryEmbeddingProvider | null,
	userIdentity: string,
	items: (ExtractedItem & { itemId: string })[],
	rels: (ExtractedRelationship & { relationshipId: string })[],
	conversationId: string,
): Promise<void> {
	const now = new Date();
	const embeddings = embeddingProvider
		? await embeddingProvider.generateEmbeddingBatch(
				items.map((item) => item.description),
			)
		: [];
	for (const it of items) {
		const embedding = embeddings.shift();
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
			embedding,
		};
		await store.addMemoryItem(item);
	}

	// Build a description -> itemId map so we can resolve relationship endpoints.
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
	const { inner, identity, store, extract, embeddingProvider, log } = deps;
	const llmLimits = loadLlmLimitConfig();

	async function resolveTurnContext(args: MemoryAwareAgentArgs) {
		const executionKind = args.executionKind ?? "interactive";
		const includeRecentMemory = args.includeRecentMemory ?? true;
		const persistConversation = args.persistConversation ?? true;
		const persistExtractedMemory = args.persistExtractedMemory ?? true;
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

		let memoryBlock = "";
		try {
			const queryEmbedding = embeddingProvider
				? await embeddingProvider.generateEmbedding(args.input)
				: undefined;
			const bundle = await store.retrieveContext(userIdentity, args.input, {
				matchedLimit: llmLimits.memoryMatchedLimit,
				recentLimit: includeRecentMemory ? llmLimits.memoryRecentLimit : 0,
				includeRecentItems: includeRecentMemory,
				queryEmbedding,
			});
			memoryBlock = fitTextToTokenBudget(
				formatRetrievalForPrompt(bundle),
				llmLimits.memoryPromptTokenBudget,
			);
		} catch (err) {
			log.warn("[memory] retrieve failed - proceeding without context", {
				err,
				userIdentity,
			});
		}

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
			// Non-critical - do not block the reply.
		}

		const prefixContext = fitTextToTokenBudget(
			`${contradictionNotice}${memoryBlock}`,
			llmLimits.memoryPromptTokenBudget,
		);

		return {
			augmentedInput: `${prefixContext}${args.input}`,
			executionKind,
			persistConversation,
			persistExtractedMemory,
			userIdentity,
		};
	}

	function persistTurn(
		args: MemoryAwareAgentArgs,
		userIdentity: string,
		responseText: string,
		executionKind: ConversationRecordKind,
		persistConversation: boolean,
		persistExtractedMemory: boolean,
	) {
		if (!persistConversation && !persistExtractedMemory) {
			return;
		}

		const recordId = ulid();
		void extract(userIdentity, args.input, responseText, args.conversationId)
			.then(async ({ profilePatch, items, relationships }) => {
				if (!persistExtractedMemory) {
					items = [];
					relationships = [];
				}
				const hasProfilePatch = Object.keys(profilePatch).length > 0;
				if (
					!persistConversation &&
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
					embeddingProvider,
					userIdentity,
					items,
					relationships,
					recordId,
				);

				if (persistConversation) {
					await store.persistConversationRecord({
						conversationId: recordId,
						userIdentity,
						channel: args.channel,
						kind: executionKind,
						startedAt: new Date(),
						endedAt: new Date(),
						transcript: [
							{ at: new Date(), role: "user", content: args.input },
							{ at: new Date(), role: "assistant", content: responseText },
						],
					});
				}
			})
			.catch((err) =>
				log.warn("[memory] ingest failed", { err, userIdentity }),
			);
	}

	return {
		async generateText(args: MemoryAwareAgentArgs): Promise<{ text: string }> {
			const t0 = Date.now();
			const {
				augmentedInput,
				executionKind,
				persistConversation,
				persistExtractedMemory,
				userIdentity,
			} = await resolveTurnContext(args);

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
				executionKind,
				durationMs: Date.now() - t0,
			});

			persistTurn(
				args,
				userIdentity,
				responseText,
				executionKind,
				persistConversation,
				persistExtractedMemory,
			);

			return { text: responseText };
		},
		async streamText(
			args: MemoryAwareAgentArgs,
		): Promise<MemoryAwareTextStreamResult> {
			const {
				augmentedInput,
				executionKind,
				persistConversation,
				persistExtractedMemory,
				userIdentity,
			} = await resolveTurnContext(args);

			const result = await inner.streamText(augmentedInput, {
				userId: userIdentity,
				conversationId: args.conversationId,
				context: {
					channel: args.channel,
					channelNativeId: args.channelUserId,
				},
			});

			let accumulatedText = "";
			let resolveText!: (text: string) => void;
			let rejectText!: (error: unknown) => void;
			const text = new Promise<string>((resolve, reject) => {
				resolveText = resolve;
				rejectText = reject;
			});

			const textStream = {
				async *[Symbol.asyncIterator]() {
					try {
						for await (const chunk of result.textStream) {
							accumulatedText += chunk;
							yield chunk;
						}

						resolveText(accumulatedText);
						persistTurn(
							args,
							userIdentity,
							accumulatedText,
							executionKind,
							persistConversation,
							persistExtractedMemory,
						);
					} catch (error) {
						rejectText(error);
						throw error;
					}
				},
			} satisfies AsyncIterable<string>;

			return { textStream, text };
		},
	};
}
