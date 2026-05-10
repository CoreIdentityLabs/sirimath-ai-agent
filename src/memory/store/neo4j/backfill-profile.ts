import type { Logger } from "@voltagent/logger";
import type { Driver } from "neo4j-driver";
import type { UserProfilePatch } from "../../schema.js";

function inferProfilePatch(descriptions: string[]): UserProfilePatch {
  const patch: UserProfilePatch = {};
  const preferences: Record<string, unknown> = {};

  for (const description of descriptions) {
    const lower = description.toLowerCase();

    const callMe = description.match(/call me\s+(.+)$/i);
    if (callMe && !patch.displayName) {
      patch.displayName = callMe[1].trim();
    }

    const livesIn = description.match(/(?:live|based) in\s+(.+)$/i);
    if (livesIn && !patch.homeLocation) {
      patch.homeLocation = livesIn[1].trim();
    }

    const timezone = description.match(
      /timezone\s+(?:is\s+)?([A-Za-z_\/+-]+)$/i,
    );
    if (timezone && !patch.timezone) {
      patch.timezone = timezone[1].trim();
    }

    if (lower.includes("prefer")) {
      preferences[`pref_${Object.keys(preferences).length + 1}`] = description;
    }
  }

  if (Object.keys(preferences).length > 0) {
    patch.preferences = preferences;
  }

  if (descriptions.length > 0) {
    patch.summary = descriptions.slice(0, 3).join("; ");
  }

  patch.profileBackfilledAt = new Date();
  return patch;
}

export async function backfillProfilesFromMemory(
  driver: Driver,
  log: Logger,
): Promise<void> {
  const session = driver.session();
  try {
    const users = await session.executeRead((tx) =>
      tx.run(
        `
				MATCH (u:UserIdentity)
				RETURN u.userIdentity AS userIdentity
				`,
      ),
    );

    for (const record of users.records) {
      const userIdentity = record.get("userIdentity") as string;
      const items = await session.executeRead((tx) =>
        tx.run(
          `
					MATCH (m:MemoryItem {userIdentity: $userIdentity})
					WHERE m.validUntil IS NULL
					RETURN m.description AS description
					ORDER BY coalesce(m.salience, 0.5) DESC, m.createdAt DESC
					LIMIT 20
					`,
          { userIdentity },
        ),
      );

      const descriptions = items.records
        .map((item) => item.get("description") as string)
        .filter(Boolean);

      if (descriptions.length === 0) continue;

      const patch = inferProfilePatch(descriptions);
      await session.executeWrite((tx) =>
        tx.run(
          `
					MERGE (p:UserProfile {userIdentity: $userIdentity})
					ON CREATE SET p.updatedAt = datetime()
					SET p.displayName = coalesce($displayName, p.displayName),
					  p.homeLocation = coalesce($homeLocation, p.homeLocation),
					  p.timezone = coalesce($timezone, p.timezone),
					  p.summary = coalesce($summary, p.summary),
					  p.preferences = $preferences,
					  p.profileBackfilledAt = $profileBackfilledAt,
					  p.updatedAt = datetime()
					`,
          {
            userIdentity,
            displayName: patch.displayName ?? null,
            homeLocation: patch.homeLocation ?? null,
            timezone: patch.timezone ?? null,
            summary: patch.summary ?? null,
            preferences: JSON.stringify(patch.preferences ?? {}),
            profileBackfilledAt:
              patch.profileBackfilledAt?.toISOString() ??
              new Date().toISOString(),
          },
        ),
      );
    }
  } finally {
    log.info("[memory] profile backfill completed");
    await session.close();
  }
}
