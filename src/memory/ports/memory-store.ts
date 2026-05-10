import type {
  ConsolidationReport,
  ConversationRecord,
  MemoryItem,
  RetrievalBundle,
  Relationship,
  UserProfile,
  UserProfilePatch,
} from "../schema.js";

export interface MemoryStore {
  persistConversationRecord(record: ConversationRecord): Promise<void>;

  addMemoryItem(item: MemoryItem): Promise<void>;

  addRelationship(rel: Relationship): Promise<void>;

  retrieve(
    userIdentity: string,
    query: string,
    limit?: number,
  ): Promise<MemoryItem[]>;

  retrieveContext(
    userIdentity: string,
    query: string,
    options?: {
      matchedLimit?: number;
      recentLimit?: number;
    },
  ): Promise<RetrievalBundle>;

  upsertProfile(
    userIdentity: string,
    patch: UserProfilePatch,
  ): Promise<UserProfile>;

  getProfile(userIdentity: string): Promise<UserProfile | null>;

  viewProfile(userIdentity: string): Promise<{
    profile: UserProfile | null;
    itemCount: number;
    recentItems: MemoryItem[];
  }>;

  exportAll(userIdentity: string): Promise<string>;

  forgetItem(userIdentity: string, itemId: string): Promise<{ ok: boolean }>;

  eraseAll(
    userIdentity: string,
  ): Promise<{ deletedItems: number; deletedRecords: number }>;

  attribute(
    userIdentity: string,
    itemId: string,
  ): Promise<{
    item: MemoryItem;
    sourceConversation: {
      conversationId: string;
      channel: string;
      startedAt: Date;
    };
  } | null>;

  listConsolidationReports(
    userIdentity: string,
    limit?: number,
  ): Promise<ConsolidationReport[]>;
}
