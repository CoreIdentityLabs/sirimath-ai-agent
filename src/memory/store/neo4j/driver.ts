import type { Logger } from "@voltagent/logger";
import neo4j, { type Driver } from "neo4j-driver";
import type { MemoryConfig } from "../../config.js";

export async function createNeo4jDriver(
	config: MemoryConfig,
	log: Logger,
): Promise<Driver | null> {
	if (!config.neo4jUri || !config.neo4jPassword) {
		log.warn(
			"[memory] NEO4J_URI or NEO4J_PASSWORD not set — memory subsystem running in degraded mode",
		);
		return null;
	}

	const driver = neo4j.driver(
		config.neo4jUri,
		neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
	);

	try {
		await driver.verifyConnectivity();
		log.info("[memory] Neo4j driver connected", { uri: config.neo4jUri });
		return driver;
	} catch (err) {
		log.warn(
			"[memory] Neo4j connectivity check failed — memory subsystem running in degraded mode",
			{ err },
		);
		try {
			await driver.close();
		} catch {
			// ignore close errors
		}
		return null;
	}
}
