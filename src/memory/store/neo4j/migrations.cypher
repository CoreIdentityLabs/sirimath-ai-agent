// =====================================================
// MIGRATION 001 — initial memory subsystem (Neo4j 5.x)
// =====================================================

// ---------- Uniqueness constraints ----------
CREATE CONSTRAINT user_identity_id IF NOT EXISTS
  FOR (u:UserIdentity) REQUIRE u.userIdentity IS UNIQUE;

CREATE CONSTRAINT cim_composite IF NOT EXISTS
  FOR (m:ChannelIdentityMapping)
  REQUIRE (m.channel, m.channelUserId) IS UNIQUE;

CREATE CONSTRAINT cim_id IF NOT EXISTS
  FOR (m:ChannelIdentityMapping) REQUIRE m.mappingId IS UNIQUE;

CREATE CONSTRAINT pairing_code_unique IF NOT EXISTS
  FOR (p:PairingCode) REQUIRE p.code IS UNIQUE;

CREATE CONSTRAINT profile_owner IF NOT EXISTS
  FOR (p:UserProfile) REQUIRE p.userIdentity IS UNIQUE;

CREATE CONSTRAINT conv_composite IF NOT EXISTS
  FOR (c:ConversationRecord)
  REQUIRE (c.userIdentity, c.conversationId) IS UNIQUE;

CREATE CONSTRAINT mi_id IF NOT EXISTS
  FOR (m:MemoryItem) REQUIRE m.itemId IS UNIQUE;

CREATE CONSTRAINT report_id IF NOT EXISTS
  FOR (r:ConsolidationReport) REQUIRE r.reportId IS UNIQUE;

// ---------- Range indexes for fast isolation filter ----------
CREATE INDEX mi_user_type IF NOT EXISTS
  FOR (m:MemoryItem) ON (m.userIdentity, m.type);

CREATE INDEX mi_stale IF NOT EXISTS
  FOR (m:MemoryItem) ON (m.userIdentity, m.lastAccessedAt);

CREATE INDEX conv_user_time IF NOT EXISTS
  FOR (c:ConversationRecord) ON (c.userIdentity, c.startedAt);

CREATE INDEX report_user_time IF NOT EXISTS
  FOR (r:ConsolidationReport) ON (r.userIdentity, r.ranAt);

CREATE INDEX pairing_expiry IF NOT EXISTS
  FOR (p:PairingCode) ON (p.expiresAt);

// ---------- Full-text index for keyword retrieval ----------
CREATE FULLTEXT INDEX memoryItemDesc IF NOT EXISTS
  FOR (m:MemoryItem) ON EACH [m.description]
  OPTIONS { indexConfig: { `fulltext.analyzer`: 'standard' } };
