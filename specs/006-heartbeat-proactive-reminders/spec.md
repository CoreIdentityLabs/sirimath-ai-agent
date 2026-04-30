# Feature Specification: Heartbeat & Proactive Task Reminders

**Feature Branch**: `006-heartbeat-proactive-reminders`  
**Created**: 2026-04-30  
**Status**: Draft  
**Input**: User description: "Heartbeat protocol / proactive task reminders — wake up on a schedule, scan what needs follow-up, and ping back to me on whatever channel is configured, instead of sitting like a statue waiting for me to come to Sirimath and ask"

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Interactive Reminder Scheduling at Task Creation (Priority: P1)

A user tells Sirimath "follow up on the proposal with the client". Rather than silently storing the task, Sirimath immediately asks: _"Got it. When should I remind you about this? For example: in 6 hours, every day at 9 AM, or every 2 days."_ The user replies "every 6 hours" and Sirimath confirms: _"Noted — I'll check in with you about the proposal every 6 hours until it's marked done."_

**Why this priority**: The entire proactive system depends on having a schedule attached to each item at the moment of creation. Without this step, reminders can only rely on inferred due dates, which are often absent or wrong.

**Independent Test**: Define a new follow-up item in chat, verify Sirimath asks for a reminder cadence, provide an interval, and verify the item is stored with the correct schedule before any heartbeat fires.

**Acceptance Scenarios**:

1. **Given** a user states a task or follow-up item, **When** Sirimath detects it is a new actionable item, **Then** Sirimath asks the user when they want to be reminded before ending the response.
2. **Given** the user provides a specific cadence (e.g., "every 6 hours", "daily at 9 AM", "in 3 days"), **When** Sirimath processes the reply, **Then** the item is stored with that exact schedule and Sirimath confirms the scheduled time.
3. **Given** the user says "don't remind me" or skips the schedule prompt, **When** the item is saved, **Then** no reminder is scheduled and the item is stored as a passive note only.
4. **Given** the user provides an ambiguous interval (e.g., "soon" or "later"), **When** Sirimath processes the reply, **Then** Sirimath asks for clarification with concrete examples.

---

### User Story 2 — Proactive Follow-Up Nudge (Priority: P1)

A user defined a follow-up item with a "every 6 hours" reminder, then closed the chat. Six hours later, without any prompting, Sirimath scans its memory, detects the due reminder, and sends a message on the user's active channel: _"Hey — you wanted to follow up on the proposal. Have you had a chance to reach out?"_

**Why this priority**: This is the delivery half of the core value proposition — the agent proactively reaching out when something is due.

**Independent Test**: Configure a follow-up with a short interval via chat, wait for the scheduled trigger time, and verify that a message arrives on the active channel without any user-initiated interaction.

**Acceptance Scenarios**:

1. **Given** a follow-up item is stored with a scheduled reminder time, **When** the heartbeat fires at or after that time, **Then** the user receives a reminder on their active channel within 60 seconds of the scheduled time.
2. **Given** a reminder has already been delivered for a recurring item, **When** the heartbeat fires before the next recurrence window, **Then** no duplicate reminder is sent.
3. **Given** no pending follow-ups exist, **When** the heartbeat fires, **Then** no message is sent to the user.

---

### User Story 3 — Scheduled Daily Digest (Priority: P2)

The user has several outstanding items spread across multiple conversations over the past week. Each morning at 9 AM, Sirimath sends a brief digest listing all open follow-ups and unresolved tasks — ranked by urgency — so the user starts the day with full situational awareness without having to ask.

**Why this priority**: A daily digest compounds value for power users; individual nudges alone may miss context about the overall open-item landscape.

**Independent Test**: Store multiple follow-up items with varying priorities, configure a daily digest time, and verify a single consolidated digest message arrives at the configured time listing all open items grouped by urgency.

**Acceptance Scenarios**:

1. **Given** the daily digest is enabled at a configured time, **When** that time arrives, **Then** the user receives one message summarising all open follow-ups, ordered by urgency.
2. **Given** an open item is marked complete before the digest fires, **When** the digest is sent, **Then** the completed item is not included.
3. **Given** no open items exist at digest time, **When** the digest fires, **Then** either no message is sent or a brief "nothing pending" confirmation is sent — based on user preference.

---

### User Story 4 — Reminder Management via Chat (Priority: P2)

A user receives a proactive reminder on their active channel and replies "snooze 2 hours" or "done". Sirimath updates the item's status accordingly — either pushing the follow-up out by 2 hours or marking it as resolved — without requiring the user to open a separate app or dashboard.

**Why this priority**: Proactive nudges only reduce friction if actioning them is equally frictionless. In-channel management closes the loop.

**Independent Test**: Trigger a reminder, reply with snooze and done commands, and verify the item is updated correctly in memory and future heartbeats reflect the new state.

**Acceptance Scenarios**:

1. **Given** a reminder has been sent, **When** the user replies "snooze 1 hour" (or equivalent), **Then** the reminder is postponed and the user receives confirmation of the new time.
2. **Given** a reminder has been sent, **When** the user replies "done" or "dismiss", **Then** the item is marked resolved and no further reminders are sent for it.
3. **Given** an ambiguous reply to a reminder, **When** Sirimath cannot determine the intent, **Then** Sirimath asks the user to clarify (snooze, dismiss, or acknowledge).

---

### User Story 5 — Heartbeat Schedule Configuration (Priority: P3)

A user tells Sirimath "only remind me between 8 AM and 8 PM on weekdays" or "check in with me every 4 hours". Sirimath stores the preference and respects it — no messages outside the permitted window, heartbeat cadence matches what was requested.

**Why this priority**: Without schedule control, proactive messages become noise. Users need to control when and how often they are contacted.

**Independent Test**: Configure a quiet-hours window, create a follow-up item with a due time inside the quiet window, and verify no reminder fires during quiet hours; verify it fires immediately after quiet hours end.

**Acceptance Scenarios**:

1. **Given** quiet hours are configured (e.g., 8 PM–8 AM), **When** a reminder would normally fire during that window, **Then** the reminder is held and delivered at the start of the next active window.
2. **Given** the user sets a custom heartbeat cadence, **When** the heartbeat fires, **Then** it fires at the configured interval (±60 seconds tolerance).
3. **Given** the user removes or resets their schedule preference, **When** the heartbeat next fires, **Then** it uses the system default schedule.

---

### Edge Cases

- What happens when the configured channel is unreachable at reminder time? → Reminder should be retried up to 3 times with linear back-off (1s, 2s, 3s delays); after all retries are exhausted the failure is logged and the delivery attempt is abandoned without crashing the agent.
- What happens when the user has multiple active channels configured? → Reminder is sent to the preferred channel; if unavailable, it falls back to the next available configured channel in priority order.
- What happens when two reminders fire at exactly the same time? → Both are delivered; if they can be batched naturally (e.g., digest mode), they are coalesced into one message.
- What happens if the agent process restarts mid-schedule? → Scheduled items persist across restarts; any missed heartbeats since last execution are evaluated on startup and fired if still relevant.
- What happens when a reminder's follow-up item is ambiguous or no longer resolvable? → Sirimath sends the reminder as-is, noting that it may need manual clarification.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST wake up on a configurable repeating schedule (minimum granularity: 1 minute) to scan for pending follow-up items.
- **FR-002**: The system MUST scan the `reminders` table for active records with a `nextFireAt` time at or before the current time and deliver them via the appropriate channel adapter.
- **FR-003**: When a user creates a new actionable item (task, follow-up, or reminder), the system MUST immediately ask the user for a reminder cadence (e.g., "every 6 hours", "daily at 9 AM", "in 3 days") before the response ends.
- **FR-004**: The system MUST store the user-specified reminder schedule alongside each follow-up item and use it to trigger future heartbeat notifications.
- **FR-005**: The system MUST deliver reminder notifications through the channel the user is actively communicating on, without hard-coding any specific channel type.
- **FR-006**: The system MUST be architecturally channel-agnostic: new channels MUST be addable via configuration or a pluggable adapter without changes to reminder logic.
- **FR-007**: The system MUST prevent duplicate reminders — once a reminder has been sent for a given recurrence window, it MUST NOT send another for the same window until the next interval elapses or the item is snoozed.
- **FR-008**: The system MUST allow users to configure quiet hours (time window and days) during which no proactive messages are sent.
- **FR-009**: The system MUST allow users to configure a daily digest time at which all open follow-ups are batched into a single summary message.
- **FR-010**: Users MUST be able to snooze a reminder via a natural-language reply on the same channel (e.g., "snooze 2 hours", "remind me tomorrow").
- **FR-011**: Users MUST be able to dismiss or mark a reminder as done via a natural-language reply on the same channel (e.g., "done", "dismiss", "ignore this").
- **FR-012**: The heartbeat schedule and quiet-hours settings MUST persist across agent restarts.
- **FR-013**: The system MUST handle channel delivery failures with retry logic; after exhausting retries, the failure MUST be logged without crashing the agent.
- **FR-014**: The system MUST evaluate any missed heartbeat ticks on startup and process any overdue reminders.

### Key Entities

- **Reminder**: A scheduled notification referencing a specific follow-up item; has status (`active` / `dismissed` / `completed`), user-defined recurrence interval, next fire time, and target channel identifier.
- **Follow-Up Item**: A task, action item, or open question created or detected in conversation that requires future attention; has description, reminder schedule (set interactively at creation), priority, and owning conversation context.
- **Reminder Schedule**: The recurrence rule or specific time attached to a follow-up item at creation time (e.g., "every 6 hours", "daily at 9 AM"); drives heartbeat firing for that item.
- **Heartbeat Schedule**: System-wide configuration defining the scan interval, quiet-hours window, and digest preferences.
- **Delivery Channel**: A channel-agnostic abstraction for any configured outbound communication channel; has type identifier, active status, and retry state. No channel type is privileged over another.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every new actionable item results in Sirimath asking for a reminder cadence — 100% of item creation interactions include the schedule prompt.
- **SC-002**: Reminder messages are delivered within 60 seconds of their user-defined scheduled time under normal operating conditions.
- **SC-003**: Zero duplicate reminders are sent for the same follow-up item within a single recurrence window.
- **SC-004**: Users can snooze or dismiss a reminder entirely within the chat interface — no secondary tool or dashboard required.
- **SC-005**: Quiet-hours configuration is respected with 100% accuracy — no messages are sent outside the permitted window.
- **SC-006**: After an agent restart, all overdue reminders that should have fired during downtime are evaluated and delivered within 2 minutes of startup.
- **SC-007**: Heartbeat schedule configuration changes take effect within one heartbeat cycle of being saved.
- **SC-008**: Daily digest, when enabled, consolidates all open items into a single message — never more than one digest message per configured digest window.
- **SC-009**: A new delivery channel can be added without modifying reminder scheduling or storage logic.

---

## Assumptions

- The system is channel-agnostic by design; no channel is treated as the default or primary in the specification. The initial implementation may use Telegram as the only available channel, but the architecture must not encode that assumption.
- Reminder schedules are always set interactively at item creation time. Auto-detection of due dates from free text is a nice-to-have, not a substitute for the explicit prompt.
- Follow-up items and reminder schedules are stored in a dedicated `reminders.db` SQLite file (`.voltagent/reminders.db`) separate from the agent memory/observability database. This keeps the reminder subsystem independently maintainable and avoids write-lock contention.
- The heartbeat scanner runs within the same process as the agent; no external cron daemon is required.
- "Quiet hours" apply globally to the user, not per-reminder.
- Snooze duration defaults to 1 hour if the user says "snooze" without specifying a duration.
- Users interact with reminders exclusively through natural language on the same channel where the reminder was delivered.
- Multi-user access is out of scope; this feature targets single-user or per-user isolated instances consistent with the existing access-control model.
