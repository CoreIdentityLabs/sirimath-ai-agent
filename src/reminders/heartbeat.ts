import type { Logger } from "@voltagent/logger";
import cron from "node-cron";
import type { HeartbeatConfigStore } from "./heartbeat-config-store.js";
import { advanceFireAt } from "./next-fire-at.js";
import type { ChannelRegistry } from "./ports/channel-adapter.js";
import type { Reminder } from "./schema.js";
import type { ReminderStore } from "./store.js";

export interface HeartbeatOptions {
	/** node-cron expression. Default: "* * * * *" (every minute). */
	cronExpression?: string;
	/** Global quiet-hours start HH:mm (overridden per-user by heartbeat_config). */
	quietHoursStart?: string;
	quietHoursEnd?: string;
}

function inQuietHours(start: string | null, end: string | null): boolean {
	if (!start || !end) return false;
	const now = new Date();
	const nowMin = now.getHours() * 60 + now.getMinutes();
	const [sh, sm] = start.split(":").map(Number);
	const [eh, em] = end.split(":").map(Number);
	const s = sh * 60 + sm;
	const e = eh * 60 + em;
	// spans-midnight safe: e.g. 22:00 → 06:00
	return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}

function isQuietDay(quietDays: string[] | null): boolean {
	if (!quietDays || quietDays.length === 0) return false;
	const days = [
		"sunday",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
	];
	const today = days[new Date().getDay()];
	return quietDays.includes(today);
}

function buildText(description: string, deliveredCount: number): string {
	return [
		`Reminder: ${description}`,
		deliveredCount > 0
			? `(sent ${deliveredCount} time${deliveredCount > 1 ? "s" : ""} before)`
			: "",
		`Reply "snooze [duration]" or "done" to manage this reminder.`,
	]
		.filter(Boolean)
		.join("\n");
}

function buildDigestText(reminders: Reminder[]): string {
	const items = reminders
		.map((r, i) => `${i + 1}. ${r.description} (ID: ${r.id})`)
		.join("\n");
	return `📋 Daily Reminder Digest\n\n${items}\n\nReply "snooze [ID] [duration]" or "done [ID]" to manage.`;
}

async function sendWithRetry(
	send: () => Promise<void>,
	maxAttempts: number,
	log: Logger,
	reminderId: string,
): Promise<boolean> {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await send();
			return true;
		} catch (err) {
			log.warn("[heartbeat] send failed", { id: reminderId, attempt, err });
			if (attempt < maxAttempts) {
				await new Promise((r) => setTimeout(r, 1000 * attempt));
			}
		}
	}
	return false;
}

export function startHeartbeat(
	store: ReminderStore,
	cfgStore: HeartbeatConfigStore,
	registry: ChannelRegistry,
	log: Logger,
	opts: HeartbeatOptions = {},
): () => void {
	const expression = opts.cronExpression ?? "* * * * *";

	if (!cron.validate(expression)) {
		throw new Error(`[heartbeat] Invalid cron expression: ${expression}`);
	}

	let ticking = false;

	const tick = async () => {
		if (ticking) return;
		ticking = true;
		try {
			const now = new Date();
			const nowHHmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
			let due: Awaited<ReturnType<typeof store.dueReminders>>;
			try {
				due = await store.dueReminders(now);
			} catch (err) {
				log.error("[heartbeat] query failed", { err });
				return;
			}

			// Group due reminders by user
			const byUser = new Map<string, typeof due>();
			for (const reminder of due) {
				const list = byUser.get(reminder.userIdentity) ?? [];
				list.push(reminder);
				byUser.set(reminder.userIdentity, list);
			}

			// Ensure digest users with no due reminders are also checked this minute
			try {
				const digestUsers = await cfgStore.getDigestUsers(nowHHmm);
				for (const cfg of digestUsers) {
					if (!byUser.has(cfg.userIdentity)) byUser.set(cfg.userIdentity, []);
				}
			} catch (err) {
				log.warn("[heartbeat] failed to fetch digest users", { err });
			}

			for (const [userIdentity, reminders] of byUser) {
				try {
					const cfg = await cfgStore.get(userIdentity);
					const qs = cfg?.quietHoursStart ?? opts.quietHoursStart ?? null;
					const qe = cfg?.quietHoursEnd ?? opts.quietHoursEnd ?? null;

					if (inQuietHours(qs, qe) || isQuietDay(cfg?.quietDays ?? null)) {
						log.debug("[heartbeat] quiet period - skipping user", {
							userIdentity,
						});
						continue;
					}

					// Digest path: fires independently of individual nudges
					if (cfg?.digestEnabled && cfg.digestTime === nowHHmm) {
						const allActive = await store.listForUser(userIdentity, false);
						if (allActive.length === 0) continue;

						const digestChannelId =
							cfg.digestChannelId ?? allActive[0].channelId;
						const adapter = registry.get(digestChannelId);
						if (!adapter) {
							log.warn("[heartbeat] no adapter for digest channel", {
								channelId: digestChannelId,
							});
							continue;
						}

						const delivered = await sendWithRetry(
							() =>
								adapter.send({
									channelUserId: allActive[0].channelUserId,
									conversationId: allActive[0].conversationId,
									text: buildDigestText(allActive),
								}),
							3,
							log,
							`digest:${userIdentity}`,
						);

						if (delivered) {
							log.info("[heartbeat] digest delivered", { userIdentity });
							// Advance/complete due reminders so they don't re-fire individually
							for (const r of reminders) {
								if (r.scheduleType === "once") {
									await store.updateStatus(r.id, "completed");
								} else {
									await store.advance(r.id, advanceFireAt(r));
								}
							}
						}
						continue;
					}

					// Individual nudges
					for (const reminder of reminders) {
						try {
							const adapter = registry.get(reminder.channelId);
							if (!adapter) {
								log.warn("[heartbeat] no adapter for channel", {
									channelId: reminder.channelId,
								});
								continue;
							}

							await store.updateStatus(reminder.id, "delivering");

							const delivered = await sendWithRetry(
								() =>
									adapter.send({
										channelUserId: reminder.channelUserId,
										conversationId: reminder.conversationId,
										text: buildText(
											reminder.description,
											reminder.deliveredCount,
										),
									}),
								3,
								log,
								reminder.id,
							);

							if (!delivered) {
								await store.updateStatus(reminder.id, "active");
								log.error("[heartbeat] exhausted retries", { id: reminder.id });
								continue;
							}

							if (reminder.scheduleType === "once") {
								await store.updateStatus(reminder.id, "completed");
							} else {
								await store.advance(reminder.id, advanceFireAt(reminder));
							}

							log.info("[heartbeat] delivered", {
								id: reminder.id,
								channel: reminder.channelId,
							});
						} catch (err) {
							log.error("[heartbeat] unexpected error for reminder", {
								id: reminder.id,
								err,
							});
						}
					}
				} catch (err) {
					log.error("[heartbeat] unexpected error for user", {
						userIdentity,
						err,
					});
				}
			}
		} finally {
			ticking = false;
		}
	};

	// Immediate startup tick — catches overdue reminders after restart (FR-014)
	tick().catch((err) => log.error("[heartbeat] startup tick error", { err }));

	const task = cron.schedule(expression, () => {
		tick().catch((err) => log.error("[heartbeat] tick error", { err }));
	});

	log.info("[heartbeat] started", { expression });

	return () => {
		task.stop();
		log.info("[heartbeat] stopped");
	};
}
