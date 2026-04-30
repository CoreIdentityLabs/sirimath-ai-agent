import type { ConsolidationReport } from "../schema.js";

export interface Consolidator {
	runOnce(userIdentity: string): Promise<ConsolidationReport>;

	runForAllUsers(): Promise<void>;

	startScheduled(): void;

	stopScheduled(): void;
}
