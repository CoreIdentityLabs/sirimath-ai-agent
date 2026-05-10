import type { Consolidator } from "../../ports/consolidator.js";
import type { IdentityStore } from "../../ports/identity-store.js";
import type { MemoryStore } from "../../ports/memory-store.js";
import type {
  ChannelIdentityMapping,
  ConsolidationReport,
  ConversationRecord,
  MemoryItem,
  RetrievalBundle,
  Relationship,
  UserProfile,
  UserProfilePatch,
} from "../../schema.js";

const DISABLED = { disabled: true, message: "Memory is currently unavailable" };

export const noopIdentityStore: IdentityStore = {
  async resolveOrCreate(_channel, _channelUserId) {
    return DISABLED.message;
  },
  async issuePairingCode(_userIdentity, _issuingChannel) {
    return { code: DISABLED.message, expiresAt: new Date() };
  },
  async consumePairingCode(_newChannel, _newChannelUserId, _code) {
    return { ok: false as const, reason: "unknown" as const };
  },
  async listChannels(_userIdentity): Promise<ChannelIdentityMapping[]> {
    return [];
  },
};

export const noopMemoryStore: MemoryStore = {
  async persistConversationRecord(_record: ConversationRecord) {},
  async addMemoryItem(_item: MemoryItem) {},
  async addRelationship(_rel: Relationship) {},
  async retrieve(_userIdentity, _query, _limit): Promise<MemoryItem[]> {
    return [];
  },
  async retrieveContext(
    _userIdentity,
    _query,
    _options,
  ): Promise<RetrievalBundle> {
    return { profile: null, matchedItems: [], recentItems: [] };
  },
  async upsertProfile(
    _userIdentity,
    _patch: UserProfilePatch,
  ): Promise<UserProfile> {
    return {
      userIdentity: DISABLED.message,
      displayName: null,
      timezone: null,
      locale: null,
      homeLocation: null,
      summary: null,
      preferences: {},
      updatedAt: new Date(),
      profileBackfilledAt: null,
    };
  },
  async getProfile(_userIdentity): Promise<UserProfile | null> {
    return null;
  },
  async viewProfile(_userIdentity): Promise<{
    profile: UserProfile | null;
    itemCount: number;
    recentItems: MemoryItem[];
  }> {
    return { profile: null, itemCount: 0, recentItems: [] };
  },
  async exportAll(_userIdentity): Promise<string> {
    return DISABLED.message;
  },
  async forgetItem(_userIdentity, _itemId): Promise<{ ok: boolean }> {
    return { ok: false };
  },
  async eraseAll(
    _userIdentity,
  ): Promise<{ deletedItems: number; deletedRecords: number }> {
    return { deletedItems: 0, deletedRecords: 0 };
  },
  async attribute(_userIdentity, _itemId) {
    return null;
  },
  async listConsolidationReports(
    _userIdentity,
    _limit,
  ): Promise<ConsolidationReport[]> {
    return [];
  },
};

export const noopConsolidator: Consolidator = {
  async runOnce(_userIdentity): Promise<ConsolidationReport> {
    throw new Error(DISABLED.message);
  },
  async runForAllUsers() {},
  startScheduled() {},
  stopScheduled() {},
};
