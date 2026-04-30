import type { Logger } from "@voltagent/logger";
import type { Consolidator } from "./ports/consolidator.js";

export function startConsolidationScheduler(
	consolidator: Consolidator,
	log: Logger,
	intervalMs = 24 * 60 * 60 * 1000,
): () => void {
	const run = async () => {
		try {
			const report = await consolidator.runForAllUsers();
			log.info("[memory] consolidation pass complete", { report });
		} catch (err) {
			log.error("[memory] consolidation failed", { err });
		}
	};

	// Kick off after 5 min to let the boot quiesce, then every 24h.
	const firstTimer = setTimeout(run, 5 * 60 * 1000);
	const repeatTimer = setInterval(run, intervalMs);

	return () => {
		clearTimeout(firstTimer);
		clearInterval(repeatTimer);
	};
}
