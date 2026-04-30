import type { Logger } from "@voltagent/logger";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { ulid } from "ulid";
import type { ExtractedItem, ExtractedRelationship } from "../schema.js";
import { extractionSystemPrompt } from "./prompt.js";
import { redactSensitive } from "./redact.js";
import { ExtractionResultSchema } from "./schema.js";

export interface ExtractionOutput {
	items: (ExtractedItem & { itemId: string })[];
	relationships: (ExtractedRelationship & { relationshipId: string })[];
}

export type Extractor = (
	userIdentity: string,
	userTurn: string,
	assistantTurn: string,
	conversationId: string,
) => Promise<ExtractionOutput>;

export async function extract(
	model: LanguageModel,
	userIdentity: string,
	userTurn: string,
	assistantTurn: string,
	conversationId: string,
	log: Logger,
): Promise<ExtractionOutput> {
	const redacted = redactSensitive(`${userTurn}\n${assistantTurn}`);
	const started = Date.now();

	const { object } = await generateObject({
		model,
		schema: ExtractionResultSchema,
		system: extractionSystemPrompt,
		prompt: redacted,
		maxRetries: 1,
	});

	const items = object.items.map((it) => ({ ...it, itemId: ulid() }));
	const relationships = object.relationships.map((r) => ({
		...r,
		relationshipId: ulid(),
	}));

	log.info("[memory] extracted", {
		userIdentity,
		conversationId,
		itemCount: items.length,
		relCount: relationships.length,
		durationMs: Date.now() - started,
	});

	return { items, relationships };
}

/** Bind model + log to produce a bound Extractor function. */
export function createExtractor(model: LanguageModel, log: Logger): Extractor {
	return (userIdentity, userTurn, assistantTurn, conversationId) =>
		extract(model, userIdentity, userTurn, assistantTurn, conversationId, log);
}
