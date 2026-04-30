import { z } from "zod";

export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const channelName = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/);

export const MemoryItemTypeSchema = z.enum([
	"entity",
	"concept",
	"decision",
	"preference",
	"event",
]);
export type MemoryItemType = z.infer<typeof MemoryItemTypeSchema>;

export const RelationshipTypeSchema = z.enum([
	"uses",
	"depends_on",
	"decided_to",
	"supersedes",
	"part_of",
	"contradicts",
	"clarifies",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const UserIdentitySchema = z.object({
	userIdentity: ulid,
	createdAt: z.coerce.date(),
});
export type UserIdentity = z.infer<typeof UserIdentitySchema>;

export const ChannelIdentityMappingSchema = z.object({
	mappingId: ulid,
	userIdentity: ulid,
	channel: channelName,
	channelUserId: z.string().min(1).max(256),
	linkedAt: z.coerce.date(),
});
export type ChannelIdentityMapping = z.infer<
	typeof ChannelIdentityMappingSchema
>;

export const PairingCodeSchema = z.object({
	code: z.string().regex(/^[A-Z0-9]{6}$/),
	userIdentity: ulid,
	issuingChannel: channelName,
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	consumedAt: z.coerce.date().nullable(),
});
export type PairingCode = z.infer<typeof PairingCodeSchema>;

export const UserProfileSchema = z.object({
	userIdentity: ulid,
	displayName: z.string().max(128).nullable(),
	preferences: z.record(z.string(), z.unknown()).default({}),
	updatedAt: z.coerce.date(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ConversationRecordSchema = z.object({
	conversationId: z.string().min(1).max(256),
	userIdentity: ulid,
	channel: channelName,
	startedAt: z.coerce.date(),
	endedAt: z.coerce.date().nullable(),
	transcript: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string(),
			at: z.coerce.date(),
		}),
	),
});
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;

export const MemoryItemSchema = z.object({
	itemId: ulid,
	userIdentity: ulid,
	type: MemoryItemTypeSchema,
	description: z.string().min(3).max(1024),
	sourceConversationId: z.string().min(1).max(256),
	validFrom: z.coerce.date(),
	validUntil: z.coerce.date().nullable(),
	accessCount: z.number().int().nonnegative().default(0),
	lastAccessedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	redacted: z.boolean().default(false),
	embedding: z.array(z.number()).length(1536).optional(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const RelationshipSchema = z.object({
	relationshipId: ulid,
	userIdentity: ulid,
	fromItemId: ulid,
	toItemId: ulid,
	type: RelationshipTypeSchema,
	confidence: z.number().min(0).max(1),
	description: z.string().max(256).nullable(),
	createdAt: z.coerce.date(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const ConsolidationReportSchema = z.object({
	reportId: ulid,
	userIdentity: ulid,
	ranAt: z.coerce.date(),
	merged: z.number().int().nonnegative(),
	pruned: z.number().int().nonnegative(),
	supersessionsRecorded: z.number().int().nonnegative(),
	contradictionsDetected: z.array(
		z.object({
			itemIdA: ulid,
			itemIdB: ulid,
			reason: z.string(),
			resolved: z.boolean().default(false),
		}),
	),
	summary: z.string(),
});
export type ConsolidationReport = z.infer<typeof ConsolidationReportSchema>;

export const ExtractedItemSchema = z.object({
	type: MemoryItemTypeSchema,
	description: z.string().min(3).max(512),
});

export const ExtractedRelationshipSchema = z.object({
	fromDescription: z.string().min(3).max(512),
	toDescription: z.string().min(3).max(512),
	type: RelationshipTypeSchema,
	description: z.string().max(256).nullable().default(null),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type ExtractedRelationship = z.infer<typeof ExtractedRelationshipSchema>;

export const ExtractionResultSchema = z.object({
	items: z.array(ExtractedItemSchema).max(20),
	relationships: z.array(ExtractedRelationshipSchema).max(20),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
