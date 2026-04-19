# Deep Research: NousResearch/hermes-agent

**Sources:**
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (commit: `957ca79e8ed2fd1377553d70b9a79232f84b122e`, 2026-04-19)
- [Official Documentation](https://hermes-agent.nousresearch.com/docs/)

**Research Date:** 2026-04-19  
**Version:** 0.10.0  
**License:** MIT

---

## Executive Summary

**Hermes Agent** is an open-source, self-improving autonomous AI agent built by [Nous Research](https://nousresearch.com) — the lab behind the Hermes, Nomos, and Psyche model families. It distinguishes itself from most AI agent frameworks through a **closed learning loop**: the agent autonomously creates procedural skills from complex experiences, improves them during use, maintains persistent bounded memory, and can search its own conversation history across sessions. It runs anywhere (local, Docker, SSH, Modal, Daytona, Singularity), speaks to the user via 15+ messaging platforms or a rich TUI, supports 47 built-in tools, is model-agnostic (18+ providers), and includes full infrastructure for generating RL training trajectories with Atropos. The codebase is primarily Python (run_agent.py is ~10,700 lines), actively developed with community contributors, and is the spiritual successor to **OpenClaw** (with migration tooling included).

---

## Architecture / System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                                  │
│                                                                       │
│  CLI (cli.py ~10k lines)   Gateway (gateway/run.py ~9k lines)        │
│  Batch Runner               ACP Adapter (VS Code/Zed/JetBrains)      │
│  API Server (web/)          Python Library (run_agent.py)             │
└──────────────┬──────────────────────────┬────────────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    AIAgent (run_agent.py)                             │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │ Prompt Builder  │  │ Provider Runtime │  │ Tool Dispatch     │   │
│  │ (prompt_builder)│  │ (runtime_prov.)  │  │ (model_tools.py)  │   │
│  │                 │  │ 18+ providers    │  │ 47 tools          │   │
│  │ SOUL.md         │  │ 3 API modes:     │  │ 19 toolsets       │   │
│  │ MEMORY.md       │  │  chat_completions│  │ Tool Registry     │   │
│  │ USER.md         │  │  codex_responses │  │ (tools/registry)  │   │
│  │ Skills index    │  │  anthropic_msg   │  │                   │   │
│  │ Context files   │  └──────────────────┘  └───────────────────┘   │
│  └─────────────────┘                                                  │
│                                                                       │
│  Compression (context_compressor.py)  IterationBudget (max 90 turns) │
│  Fallback model switching             Interruptible API calls         │
└──────────────┬──────────────────────────────────────┬────────────────┘
               │                                      │
               ▼                                      ▼
┌──────────────────────────┐         ┌──────────────────────────────┐
│  Session Storage          │         │  Tool Backends               │
│  SQLite + FTS5            │         │  ┌──────────┬──────────────┐ │
│  hermes_state.py          │         │  │ Terminal │ 6 backends:  │ │
│  gateway/session.py       │         │  │          │ local,docker,│ │
│  ~/.hermes/state.db       │         │  │          │ ssh,modal,   │ │
└──────────────────────────┘         │  │          │ daytona,sing.│ │
                                     │  ├──────────┼──────────────┤ │
┌──────────────────────────┐         │  │ Browser  │ 5 backends   │ │
│  Persistent Memory        │         │  ├──────────┼──────────────┤ │
│  MEMORY.md (2200 chars)   │         │  │ Web      │ search/extrt │ │
│  USER.md (1375 chars)     │         │  ├──────────┼──────────────┤ │
│  ~/.hermes/memories/      │         │  │ MCP      │ dynamic      │ │
└──────────────────────────┘         │  └──────────┴──────────────┘ │
                                     └──────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│                       MESSAGING GATEWAY                               │
│  18 platform adapters: Telegram, Discord, Slack, WhatsApp, Signal,   │
│  Matrix, Mattermost, Email, SMS, DingTalk, Feishu, WeCom, BlueBubbles│
│  QQBot, Home Assistant, Webhook, API Server, WeiXin                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component 1: AIAgent — The Core Loop (`run_agent.py`)

**File:** `run_agent.py` (~10,700 lines)[^1]  
**Entry point:** `AIAgent` class

The `AIAgent` class is the core orchestration engine. It is deliberately platform-agnostic — the same class serves the CLI, gateway, ACP server, batch runner, and API server. Platform differences are isolated to the entry point layer, not the agent.

### Two Entry Points

```python
# Simple — returns final response string
response = agent.chat("Fix the bug in main.py")

# Full — returns dict with messages, metadata, usage stats
result = agent.run_conversation(
    user_message="Fix the bug in main.py",
    system_message=None,           # auto-built if omitted
    conversation_history=None,      # auto-loaded from session if omitted
    task_id="task_abc123")
```

### API Modes

Three modes resolved at startup from provider detection, explicit args, and base URL heuristics[^2]:

| API Mode | Used For | Client |
|---------|---------|--------|
| `chat_completions` | OpenAI-compatible endpoints, OpenRouter, most providers | `openai.OpenAI` |
| `codex_responses` | OpenAI Codex / Responses API | `openai.OpenAI` + Responses format |
| `anthropic_messages` | Native Anthropic Messages API | `anthropic.Anthropic` via adapter |

**Mode resolution order:**
1. Explicit `api_mode` constructor arg
2. Provider-specific detection (e.g., `anthropic` → `anthropic_messages`)
3. Base URL heuristic (e.g., `api.anthropic.com` → `anthropic_messages`)
4. Default: `chat_completions`

### Turn Lifecycle

Each agent turn follows this sequence[^2]:

```
run_conversation()
  1. Append user message to history
  2. Build or reuse cached system prompt (prompt_builder.py)
  3. Check preflight compression (>50% context window filled)
  4. Build API messages (format varies by api_mode)
  5. Inject ephemeral prompt layers (budget warnings, context pressure)
  6. Apply Anthropic prompt caching markers if applicable
  7. Make interruptible API call (_api_call_with_interrupt)
  8. Parse response:
     → If tool_calls: execute them, append results, loop to step 4
     → If text: persist session, flush memory if needed, return
```

### Message Format

Internal messages always use OpenAI-compatible format[^2]:
```json
{"role": "system", "content": "..."}
{"role": "user", "content": "..."}
{"role": "assistant", "content": "...", "tool_calls": [...]}
{"role": "tool", "tool_call_id": "...", "content": "..."}
```

### Interruptible API Calls

API requests run in a background thread monitored by an interrupt event. When cancelled (user sends new message, `/stop`, or SIGINT), the API thread is abandoned, the partial response discarded, and history is not polluted with a partial assistant turn.[^2]

### Tool Execution

- **Single tool** → executed in main thread
- **Multiple tools** → executed concurrently via `ThreadPoolExecutor`; results re-inserted in original call order
- **Interactive tools** (e.g., `clarify`) → force sequential execution
- **Agent-level tools** (intercepted before registry): `todo`, `memory`, `session_search`, `delegate_task`

### Iteration Budget & Fallback

- Default: **90 iterations** (configurable via `agent.max_turns`)
- Subagents get independent budgets, capped at `delegation.max_iterations` (default: 50)
- **Fallback model switching:** on 429/5xx/401/403 errors, cycles through `fallback_providers` list, attempts credential refresh before failover

### Compression

- **Preflight**: triggers when conversation > 50% of model's context window
- **Gateway auto-compress**: triggers at 85%
- Process: flush memory to disk → summarize middle turns → preserve last N messages (`compression.protect_last_n`, default: 20) → generate new session lineage ID

---

## Component 2: Prompt System (`agent/prompt_builder.py`)

**File:** `agent/prompt_builder.py` (45.6 KB)[^3]

The cached system prompt is assembled from **10 layers** in a fixed order[^4]:

| Layer | Source | Notes |
|-------|--------|-------|
| 1 | `SOUL.md` (~/.hermes/SOUL.md) | Agent identity/persona; falls back to `DEFAULT_AGENT_IDENTITY` |
| 2 | Tool-aware behavior guidance | Memory usage, session search instructions, tool-use enforcement |
| 3 | Honcho static block | When Honcho memory provider is active |
| 4 | Optional system message | From config or API override |
| 5 | Frozen MEMORY.md snapshot | Fixed at session start (2,200 char limit) |
| 6 | Frozen USER.md snapshot | Fixed at session start (1,375 char limit) |
| 7 | Skills index | `skills_list()` output — all available skills |
| 8 | Context files | AGENTS.md / .hermes.md / CLAUDE.md / .cursorrules (priority order) |
| 9 | Timestamp + session ID | Injected once at build time |
| 10 | Platform hint | "You are a CLI AI Agent..." / "You are a Telegram bot..." |

**Key design principle:** The system prompt is assembled **once** at session start and never mutated mid-session. This preserves Anthropic's prefix cache across turns. Changes to memory during a session are persisted to disk but only appear in the *next* session's system prompt.[^4]

### Context File Priority

```python
# First match wins — only ONE project context loaded per session
project_context = (
    _load_hermes_md(cwd_path)       # 1. .hermes.md / HERMES.md (walks to git root)
    or _load_agents_md(cwd_path)    # 2. AGENTS.md (cwd only)
    or _load_claude_md(cwd_path)    # 3. CLAUDE.md (cwd only)
    or _load_cursorrules(cwd_path)  # 4. .cursorrules / .cursor/rules/*.mdc
)
```

All context files are: **security-scanned** (prompt injection detection), **truncated** at 20,000 chars (70/20 head/tail ratio), and have YAML frontmatter stripped.

---

## Component 3: Persistent Memory System

**Files:** `agent/memory_manager.py`, `agent/memory_provider.py`, `plugins/memory/`[^5]

### Memory Architecture

Two bounded files form the core memory[^5]:

| File | Purpose | Char Limit | Approx Tokens |
|------|---------|-----------|----------------|
| `MEMORY.md` | Agent notes — environment, conventions, lessons, task diary | 2,200 | ~800 |
| `USER.md` | User profile — preferences, communication style, timezone | 1,375 | ~500 |

**Location:** `~/.hermes/memories/`

### Memory Tool API

The agent writes memory via the `memory` tool with three actions:
- `add` — add a new entry
- `replace` — replace via unique substring matching on `old_text`
- `remove` — remove via unique substring matching on `old_text`

### Session Search

Beyond bounded memory, all sessions are stored in SQLite (`~/.hermes/state.db`) with FTS5 full-text indexing. The `session_search` tool queries past conversations with LLM summarization (Gemini Flash) for cross-session recall. This is unbounded — all sessions are searchable.[^5]

```
Feature         | Persistent Memory     | Session Search
----------------|-----------------------|----------------------
Capacity        | ~1,300 tokens total   | Unlimited
Speed           | Instant (in prompt)   | Requires search + LLM
Use case        | Always-available facts| Finding past specifics
Token cost      | Fixed per session     | On-demand
```

### Security Scanning

Memory entries are scanned for prompt injection and credential exfiltration patterns before acceptance. Content matching threat patterns or containing invisible Unicode is rejected.[^5]

### External Memory Providers (8 plugins)

- **Honcho** (`plugins/memory/honcho/`) — dialectic user modeling via [plastic-labs/honcho](https://github.com/plastic-labs/honcho)
- **Mem0**, **OpenViking**, **Hindsight**, **Holographic**, **RetainDB**, **ByteRover** (additional plugins)

Only one memory provider can be active at a time (single-select via `hermes plugins` or `config.yaml`).

---

## Component 4: Skills System

**Files:** `agent/skill_commands.py`, `hermes_cli/skills_config.py`, `hermes_cli/skills_hub.py`[^6]

Skills are **on-demand knowledge documents** that the agent loads when needed. They implement **progressive disclosure** to minimize token cost:

```
Level 0: skills_list()           → [{name, description, category}, ...]  (~3k tokens)
Level 1: skill_view(name)        → Full content + metadata
Level 2: skill_view(name, path)  → Specific reference file
```

### SKILL.md Format

```yaml
---
name: my-skill
description: Brief description
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [python, automation]
    category: devops
    fallback_for_toolsets: [web]   # Show only when web toolset unavailable
    requires_toolsets: [terminal]  # Show only when terminal toolset present
    config:
      - key: my.setting
        description: "What this controls"
        default: "value"
---
# Skill Title
## When to Use
## Procedure
## Pitfalls
## Verification
```

### Skill Directory Structure

```
~/.hermes/skills/
├── mlops/
│   └── axolotl/
│       ├── SKILL.md               # Main instructions
│       ├── references/            # Additional docs
│       ├── scripts/               # Helper scripts
│       └── assets/
├── devops/
│   └── deploy-k8s/
│       └── SKILL.md
└── .hub/                          # Skills Hub state
    ├── lock.json
    ├── quarantine/
    └── audit.log
```

### Skill Ecosystem

- **agentskills.io open standard** — Skills are portable across compatible agents
- **Skills Hub** — Community-contributed skills catalog
- **Agent-managed skills** — Agent can create, update, delete skills via `skill_manage` tool
- **Conditional activation** — Skills hide/show based on toolset availability (e.g., DuckDuckGo fallback appears only when Firecrawl/web toolset is absent)
- **External skill directories** — Read-only external directories can be configured alongside the local `~/.hermes/skills/`

---

## Component 5: Tool System (47 tools, 19 toolsets)

**Files:** `tools/registry.py`, `model_tools.py`, `toolsets.py`[^7]

### Tool Categories

| Category | Key Tools | Notes |
|---------|---------|-------|
| Web | `web_search`, `web_extract` | Exa, Firecrawl, parallel-web |
| Terminal & Files | `terminal`, `process`, `read_file`, `write_file`, `patch` | 6 backends |
| Browser | `browser_navigate`, `browser_snapshot`, `browser_vision` | 10 browser tools |
| Media | `vision_analyze`, `image_generate`, `text_to_speech` | FAL, ElevenLabs, Edge TTS |
| Agent Orchestration | `todo`, `clarify`, `execute_code`, `delegate_task` | Subagent spawning |
| Memory & Recall | `memory`, `session_search` | SQLite FTS5 |
| Automation | `cronjob`, `send_message` | Cross-platform delivery |
| Integrations | `ha_*`, `mcp_*`, `rl_*` | Home Assistant, MCP, RL environments |

### Terminal Backends

| Backend | Description | Isolation |
|---------|-------------|----------|
| `local` | Host machine (default) | None |
| `docker` | Container (read-only rootfs, all caps dropped, PID limit 256) | High |
| `ssh` | Remote server | Medium (network isolation) |
| `singularity` | HPC rootless containers | Medium |
| `modal` | Serverless cloud | High + serverless |
| `daytona` | Persistent remote dev workspace | High + serverless persistence |

Container security hardening (Docker/Singularity/Modal/Daytona)[^7]:
- Read-only root filesystem
- All Linux capabilities dropped
- No privilege escalation
- PID limit: 256 processes
- Full namespace isolation
- Persistent workspace via volume mounts (not writable root layer)

### Background Process Management

```python
terminal(command="pytest -v tests/", background=True)
# Returns: {"session_id": "proc_abc123", "pid": 12345}

process(action="list")       # All running processes
process(action="poll", session_id="proc_abc123")   # Status check
process(action="wait", session_id="proc_abc123")   # Block until done
process(action="log", session_id="proc_abc123")    # Full output
process(action="kill", session_id="proc_abc123")   # Terminate
process(action="write", session_id="proc_abc123", data="y")  # Send input
```

### MCP Integration

MCP tools are auto-discovered and registered with the naming convention `mcp_<server>_<tool>`[^8]:

```yaml
mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
  remote_api:
    url: "https://mcp.example.com/mcp"
    headers:
      Authorization: "Bearer ***"
```

Per-server `include`/`exclude` filtering allows fine-grained control over which MCP tools Hermes exposes.

---

## Component 6: Messaging Gateway (`gateway/`)

**Files:** `gateway/run.py` (503 KB!), `gateway/session.py` (48 KB), `gateway/config.py` (58 KB)[^9]

The gateway is a long-running process supporting **18 platform adapters**:

| Platform | Adapter | Notes |
|---------|---------|-------|
| Telegram | `gateway/platforms/telegram.py` | Webhooks supported |
| Discord | `gateway/platforms/discord.py` | Voice supported |
| Slack | `gateway/platforms/slack.py` | Bolt framework |
| WhatsApp | `gateway/platforms/whatsapp.py` | |
| Signal | `gateway/platforms/signal.py` | |
| Matrix | `gateway/platforms/matrix.py` | E2E encryption on Linux |
| Mattermost | `gateway/platforms/mattermost.py` | |
| Email | `gateway/platforms/email.py` | |
| SMS | `gateway/platforms/sms.py` | |
| DingTalk | `gateway/platforms/dingtalk.py` | |
| Feishu/Lark | `gateway/platforms/feishu.py` | |
| WeCom | `gateway/platforms/wecom.py` | |
| BlueBubbles | `gateway/platforms/bluebubbles.py` | iMessage on macOS |
| QQBot | `gateway/platforms/qqbot.py` | |
| Home Assistant | `gateway/platforms/homeassistant.py` | |
| Webhook | `gateway/platforms/webhook.py` | Generic inbound webhook |
| API Server | `gateway/platforms/api_server.py` | HTTP REST interface |
| WeiXin | `gateway/platforms/weixin.py` | |

### Gateway Message Flow

```
Platform event → Adapter.on_message() → MessageEvent
  → GatewayRunner._handle_message()
    → _is_user_authorized()         # 6-layer authorization check
    → resolve session key
    → create AIAgent with session history
    → AIAgent.run_conversation()
    → delivery.py → back through adapter
```

### Authorization Model (6-layer check order)[^10]

1. Per-platform allow-all flag (e.g., `DISCORD_ALLOW_ALL_USERS=true`)
2. DM pairing approved list (QR-code or code-based pairing)
3. Platform-specific allowlists (e.g., `TELEGRAM_ALLOWED_USERS=12345`)
4. Global allowlist (`GATEWAY_ALLOWED_USERS=12345,67890`)
5. Global allow-all (`GATEWAY_ALLOW_ALL_USERS=true`)
6. Default: **deny**

### Gateway Key Files

- `gateway/run.py` — GatewayRunner (503 KB, main dispatch)
- `gateway/session.py` — SessionStore with per-platform isolation
- `gateway/hooks.py` — Hook discovery and lifecycle events
- `gateway/mirror.py` — Cross-session message mirroring
- `gateway/pairing.py` — DM pairing authorization
- `gateway/delivery.py` — Outbound message delivery
- `gateway/stream_consumer.py` — Streaming response handling (41 KB)
- `gateway/status.py` — Token locks, profile-scoped process tracking

---

## Component 7: Security Model

**File:** `tools/approval.py`[^10]

Seven security layers:
1. **User authorization** — allowlists + DM pairing (6-layer check)
2. **Dangerous command approval** — human-in-the-loop
3. **Container isolation** — Docker/Singularity/Modal hardening
4. **MCP credential filtering** — env var isolation for MCP subprocesses
5. **Context file scanning** — prompt injection detection in project files
6. **Cross-session isolation** — sessions cannot access each other's data; cron paths hardened against path traversal
7. **Input sanitization** — working directory params validated against allowlist

### Command Approval Modes

| Mode | Behavior |
|------|---------|
| `manual` (default) | Always prompt for dangerous commands |
| `smart` | Auxiliary LLM assesses risk; low-risk auto-approved, genuine danger auto-denied, uncertain escalates |
| `off` / `--yolo` | Disable all safety checks |

**Dangerous patterns triggering approval** (in `tools/approval.py`): `rm -r`, `chmod 777`, `DROP TABLE`, `DELETE FROM` without WHERE, `TRUNCATE TABLE`, `mkfs`, `dd if=`, `curl | sh`, `wget | sh`, fork bombs, `kill -9 -1`, `pkill`, `find -exec rm`, and dozens more.

**Container bypass:** Approval checks are **skipped** inside Docker/Singularity/Modal/Daytona since the container is the security boundary.

---

## Component 8: Cron Scheduler (`cron/`)

**Files:** `cron/jobs.py`, `cron/scheduler.py`[^11]

Cron in Hermes is **first-class agent tasks** (not shell tasks):
- Jobs stored in JSON (`~/.hermes/jobs.json`)
- Support multiple schedule formats (crontab, interval, natural language)
- Can attach skills and scripts as context
- Deliver results to **any configured platform** (Telegram, Discord, etc.)
- A fresh `AIAgent` instance is created per job run (no conversation history)

```
Scheduler tick → load due jobs from jobs.json
  → create fresh AIAgent (no history)
  → inject attached skills as context
  → run job prompt
  → deliver response to target platform
  → update job state and next_run
```

Use cases: daily reports, nightly backups, weekly audits, monitoring alerts.

---

## Component 9: Plugin System (`plugins/`)

**File:** `hermes_cli/plugins.py` — `PluginManager`[^12]

Three plugin discovery sources:
1. `~/.hermes/plugins/` — User plugins
2. `.hermes/plugins/` — Project-level plugins
3. pip entry points

Plugins can register:
- Custom tools
- Lifecycle hooks
- CLI commands

Two **single-select** specialized plugin types:
- **Memory providers** (`plugins/memory/`) — replaces default MEMORY.md + USER.md system
- **Context engines** (`plugins/context_engine/`) — replaces default `context_compressor.py`

Only one of each can be active at a time.

---

## Component 10: RL / Research Infrastructure

**Optional dependencies:** `atroposlib`, `tinker`, `wandb`[^13]

Built-in infrastructure for Nous Research's model training pipeline:

- **`batch_runner.py`** — Batch trajectory generation
- **`trajectory_compressor.py`** — Trajectory compression for training
- **`environments/`** — Atropos RL environment framework
- **`tinker-atropos`** — Git submodule for RL training integration
- **Export format:** ShareGPT-format trajectories for fine-tuning
- **WandB integration** — Training metrics logging

This is notable: Hermes is the agent Nous Research uses to **generate training data** for future Hermes/Nomos/Psyche model iterations.

---

## Component 11: LLM Provider System

**Files:** `hermes_cli/auth.py`, `hermes_cli/runtime_provider.py`, `hermes_cli/models.py`[^14]

**18+ supported providers:**

| Provider | Key Env Var(s) | Notes |
|---------|---------------|-------|
| OpenAI | `OPENAI_API_KEY` | Default |
| Anthropic | `ANTHROPIC_API_KEY` | With prompt caching |
| OpenRouter | `OPENROUTER_API_KEY` | 200+ models |
| Nous Portal | `NOUS_API_KEY` | Native; Tool Gateway included |
| Google (Gemini) | `GOOGLE_API_KEY` | |
| NVIDIA NIM | `NVIDIA_API_KEY` | Nemotron models |
| Groq | `GROQ_API_KEY` | Fast inference |
| Mistral | `MISTRAL_API_KEY` | |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | |
| Xiaomi MiMo | `MIMO_API_KEY` | |
| z.ai/GLM | `ZAI_API_KEY` | |
| Kimi/Moonshot | `MOONSHOT_API_KEY` | |
| MiniMax | `MINIMAX_API_KEY` | |
| HuggingFace | `HF_API_KEY` | |
| Ollama | `OLLAMA_BASE_URL` | Local |
| Custom endpoint | `CUSTOM_API_BASE` | Any OpenAI-compatible |

Switch provider at any time with `hermes model` or `/model [provider:model]` in conversation — no restart required.

---

## Component 12: CLI & TUI (`cli.py`, `hermes_cli/`)

**Files:** `cli.py` (~10,000 lines), `hermes_cli/main.py` (~6,000 lines), `hermes_cli/commands.py`[^15]

**Full TUI features:**
- Multiline editing (prompt_toolkit)
- Slash-command autocomplete
- Conversation history navigation
- Interrupt-and-redirect (Ctrl+C mid-inference sends new message)
- Streaming tool output with spinner
- Reasoning content display (for models with extended thinking)
- Theming engine (`skin_engine.py`)

**Key CLI commands:**

| Command | Purpose |
|---------|---------|
| `hermes` | Start interactive TUI |
| `hermes model` | Switch LLM provider/model |
| `hermes tools` | Configure enabled tools per platform |
| `hermes gateway start/stop` | Manage messaging gateway |
| `hermes setup` | Full interactive setup wizard |
| `hermes doctor` | Diagnose configuration issues |
| `hermes update` | Update to latest version |
| `hermes claw migrate` | Migrate from OpenClaw |
| `hermes -p <name>` | Start with named profile (isolated HERMES_HOME) |
| `hermes chat --toolsets "web,terminal"` | Single conversation with specific toolsets |
| `hermes chat --resume` | Resume last session |

**Slash commands (shared CLI + messaging):**

| Command | Purpose |
|---------|---------|
| `/new` / `/reset` | Start fresh conversation |
| `/model [provider:model]` | Switch model mid-session |
| `/personality [name]` | Set SOUL.md personality |
| `/skills` | Browse/manage skills |
| `/compress` | Manual context compression |
| `/usage` | Show token usage |
| `/insights [--days N]` | Usage analytics |
| `/yolo` | Toggle YOLO mode (disable approvals) |
| `/retry` / `/undo` | Retry/undo last turn |
| `/stop` | Interrupt current work (gateway) |
| `/platforms` | Platform-specific status |

---

## Data Flow

### CLI Session
```
User input
  → HermesCLI.process_input()
  → AIAgent.run_conversation()
    → prompt_builder.build_system_prompt()
    → runtime_provider.resolve_runtime_provider()
    → API call (chat_completions / codex_responses / anthropic_messages)
    → tool_calls? → model_tools.handle_function_call() → loop
    → final response → display → save to SessionDB
```

### Gateway Message
```
Platform event → Adapter.on_message() → MessageEvent
  → GatewayRunner._handle_message()
    → authorize user (6-layer check)
    → resolve session key
    → create AIAgent with session history
    → AIAgent.run_conversation()
    → deliver response back through adapter
```

### Cron Job
```
Scheduler tick → load due jobs from jobs.json
  → create fresh AIAgent (no history)
  → inject attached skills as context
  → run job prompt
  → deliver response to target platform
  → update job state and next_run
```

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|-----------|---------|-----------|
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Main repo (MIT) | `run_agent.py`, `cli.py`, `gateway/run.py`, `agent/`, `tools/` |
| [NousResearch/atropos](https://github.com/NousResearch/atropos) | RL training framework | Pinned at `c20c8525` in `pyproject.toml` |
| [thinking-machines-lab/tinker](https://github.com/thinking-machines-lab/tinker) | RL training (Tinker) | Pinned at `30517b66` in `pyproject.toml` |
| [plastic-labs/honcho](https://github.com/plastic-labs/honcho) | Dialectic user modeling | Memory provider plugin |
| [tobi/qmd](https://github.com/tobi/qmd) | Wiki/markdown search | Optional companion |
| [agentskills.io](https://agentskills.io) | Skills Hub (open standard) | Skills distribution |

---

## Recent Development Activity

As of the research date (2026-04-19), the repository is **very actively developed** with multiple commits per day[^16]:

| Commit | Message | Author | Date |
|--------|---------|--------|------|
| `957ca79` | fix(feishu): drop dead helper and cover repeated fenced blocks | kshitijk4poor | 2026-04-19 |
| `4b6ff0e` | fix: tighten gateway interrupt salvage follow-ups | kshitijk4poor | 2026-04-19 |
| `8466268` | fix(gateway): keep typing loop overrides backward-compatible | helix4u | 2026-04-19 |
| `ff63e2e` | fix: tighten telegram docker-media salvage follow-ups | kshitijk4poor | 2026-04-19 |
| `b05d304` | docs: clarify profiles vs workspaces | helix4u | 2026-04-14 |

---

## Relationship to OpenClaw

Hermes Agent is the successor to **OpenClaw** (`~/.openclaw`). The migration tool `hermes claw migrate` imports[^17]:
- `SOUL.md` — persona file
- `MEMORY.md` and `USER.md` — memory entries
- User-created skills → `~/.hermes/skills/openclaw-imports/`
- Command allowlist
- Messaging settings and platform configs
- API keys (Telegram, OpenRouter, OpenAI, Anthropic, ElevenLabs)
- TTS assets and workspace audio files
- `AGENTS.md` workspace instructions

---

## Design Principles

From the architecture documentation[^12]:

| Principle | What it means |
|---------|--------------|
| **Prompt stability** | System prompt never changes mid-session. No cache-breaking mutations except `/model`. |
| **Observable execution** | Every tool call visible to user via callbacks. CLI spinner + gateway progress messages. |
| **Interruptible** | API calls and tool execution cancellable mid-flight. |
| **Platform-agnostic core** | One `AIAgent` class for CLI, gateway, ACP, batch, API server. |
| **Loose coupling** | Optional subsystems (MCP, plugins, memory providers, RL) use registry patterns + `check_fn` gating. |
| **Profile isolation** | Each profile (`hermes -p <name>`) gets its own HERMES_HOME, config, memory, sessions, gateway PID. |

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Architecture overview, entry points, directory structure | **High** | Official architecture docs[^12] + verified against repo file listing |
| pyproject.toml dependencies and versions | **High** | Directly read from `pyproject.toml` (SHA: `bd836736`)[^14] |
| Agent loop internals (API modes, turn lifecycle, tool execution) | **High** | Official agent-loop docs cross-referenced with `run_agent.py` preview[^2] |
| Prompt assembly layers and caching design | **High** | Official prompt-assembly docs with code excerpts[^4] |
| Memory limits (2200/1375 chars) | **High** | Directly from memory docs and config |
| 47 tools / 19 toolsets count | **High** | Architecture docs state this explicitly |
| Gateway file sizes (run.py: 503 KB) | **High** | Verified from GitHub API file listing[^9] |
| 18 platform adapters | **High** | Counted from `gateway/platforms/` directory listing |
| OpenClaw migration details | **High** | From README and `hermes claw migrate --help` description |
| RL training integration (Atropos/Tinker) | **High** | Confirmed from pyproject.toml pinned deps + architecture docs |
| Specific line counts (run_agent.py ~10,700 lines) | **High** | Stated in official architecture docs |
| Security approval patterns | **High** | Full list fetched from security docs page |
| External memory providers (8 plugins) | **Medium** | Docs mention "8 providers" but only Honcho and a few named |
| Skill count (bundled vs optional) | **Medium** | Catalogs referenced but not fully enumerated in research |

---

## Footnotes

[^1]: `run_agent.py` — SHA `8e1fbfed19424ecff5e0d251754958f386b2c3b7`, preview shows `AIAgent` class description: "Automatic tool calling loop until completion, configurable model parameters, error handling and recovery, message history management, support for multiple modes"

[^2]: [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop) — Official documentation page covering API modes, turn lifecycle, tool execution, budget/fallback, compression.

[^3]: `agent/prompt_builder.py` — SHA `3e042f65dfa436a63f87871e290736826e6ed631`, docstring: "System prompt assembly -- identity, platform hints, skills index, context files."

[^4]: [Prompt Assembly](https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly) — Official documentation with 10-layer order, code excerpts from `prompt_builder.py`, and frozen snapshot rationale.

[^5]: [Memory System](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) — Official documentation covering MEMORY.md/USER.md limits, memory tool API, session search, external providers.

[^6]: [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) — Official documentation covering SKILL.md format, progressive disclosure, conditional activation, external directories.

[^7]: [Tools & Toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools) — Official documentation covering 47 tools, 6 terminal backends, container security hardening, background process management.

[^8]: [MCP Integration](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) — Official MCP docs covering stdio and HTTP servers, `mcp_<server>_<tool>` naming, per-server filtering.

[^9]: `gateway/` directory listing — From GitHub API (ref: `957ca79e`). `gateway/run.py` is 503 KB, `gateway/config.py` is 58 KB, `gateway/session.py` is 48 KB, `gateway/stream_consumer.py` is 41 KB.

[^10]: [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) — Official security docs covering 7-layer model, approval modes, dangerous command patterns table, YOLO mode, authorization check order.

[^11]: [Cron Scheduling](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) — Referenced from architecture docs; cron jobs are first-class agent tasks delivering to any platform.

[^12]: [Architecture Overview](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture) — Official architecture docs covering directory structure, data flow, major subsystems, design principles.

[^13]: `pyproject.toml` (SHA: `bd836736`) — RL dependencies: `atroposlib @ git+...@c20c8525`, `tinker @ git+...@30517b66`, `wandb>=0.15.0,<1`, `fastapi`, `uvicorn`.

[^14]: `pyproject.toml` (SHA: `bd836736`) — Full dependency list including all 18+ provider extras, version: `0.10.0`.

[^15]: README.md (SHA: `622910b3`) — CLI commands table, slash commands table, `hermes gateway`, `hermes claw migrate`, `hermes doctor`.

[^16]: [Recent commits](https://github.com/NousResearch/hermes-agent/commits/main) — 10 most recent commits fetched from GitHub API, all dated 2026-04-14 to 2026-04-19.

[^17]: README.md (SHA: `622910b3`) — OpenClaw migration section listing all imported assets: SOUL.md, MEMORY.md, USER.md, skills, command allowlist, messaging settings, API keys, TTS assets, AGENTS.md.
