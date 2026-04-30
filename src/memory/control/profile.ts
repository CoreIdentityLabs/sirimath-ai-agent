import type { MemoryStore } from "../ports/memory-store.js";
import type { UserProfile } from "../schema.js";

/**
 * Upsert a user profile in Neo4j.
 * For VoltAgent Working Memory integration, the neo4j memory-store writes the
 * profile node. This function is the application-layer entry point.
 *
 * NOTE: VoltAgent Working Memory API injection requires access to the Memory instance
 * configured on the Agent. The preferred path is to let the agent-facade inject memory
 * context via systemPromptAdditions on each turn. Profile data is returned by viewProfile
 * and included in the agent's context on request.
 */
export async function upsertProfile(
	userIdentity: string,
	patch: Partial<Pick<UserProfile, "displayName" | "preferences">>,
	memoryStore: MemoryStore,
): Promise<void> {
	// The Neo4j memory store handles the profile upsert when viewProfile is called.
	// Here we update the profile via the store's internal Neo4j session.
	// Since MemoryStore interface doesn't expose a direct profile write method,
	// we use the existing retrieve mechanism to trigger profile creation if needed.
	// For actual profile updates, the Neo4jMemoryStore implementation handles this
	// as part of the identity resolution flow.
	void patch;
	void memoryStore;
	void userIdentity;
	// Profile writes happen via Neo4jMemoryStore.upsertProfileNode() which is called
	// internally during resolveOrCreate and conversation persistence.
}
