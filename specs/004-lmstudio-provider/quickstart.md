# Quickstart: LM Studio with Sirimath AI

This guide shows you how to run Sirimath AI against a locally hosted model using LM Studio.

---

## Prerequisites

1. **LM Studio installed** — download from https://lmstudio.ai (macOS, Windows, Linux)
2. **A model downloaded** — open LM Studio, go to the **Discover** tab and download a chat model (e.g. `Llama 3.2 1B` or `Gemma 2 9B`)
3. **LM Studio server started** — open the **Local Server** tab in LM Studio and click **Start Server** (default port: 1234)
4. **Node.js ≥ 20** and Sirimath AI dependencies installed (`npm install`)

---

## Step 1 — Install the Provider Package

```bash
npm install @ai-sdk/openai-compatible
```

---

## Step 2 — Configure Environment Variables

Copy `.env.example` to `.env` (if you haven't already), then set:

```env
# ─── LM Studio (Local Models) ──────────────────────────────
MODEL_PROVIDER=lmstudio
MODEL_ID=llama-3.2-1b

# Optional: override if LM Studio runs on a non-default port or remote host
# LMSTUDIO_BASE_URL=http://localhost:1234/v1
```

**Finding your model ID**: In LM Studio's Local Server tab, the model identifier shown next to the loaded model is what you put in `MODEL_ID`. Common examples:
- `llama-3.2-1b`
- `bartowski/gemma-2-9b-it-GGUF`
- `deepseek-r1-distill-qwen-7b`

No `OPENAI_API_KEY` or any other cloud credential is needed.

---

## Step 3 — Start Sirimath AI

```bash
npm run dev
```

Send a message via Telegram — the response will come from your locally running model.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot connect to API: connect ECONNREFUSED 127.0.0.1:1234` | LM Studio server not started | Open LM Studio → Local Server tab → Start Server |
| `Model not found` or empty response | Model ID mismatch | Copy exact model ID from LM Studio's Local Server tab |
| Hangs for a long time before failing | Network timeout (remote host unreachable) | Check `LMSTUDIO_BASE_URL` points to a reachable host; for localhost, ECONNREFUSED is immediate |
| `Unsupported MODEL_PROVIDER: "lmstudio"` | Running an older build | Run `npm install` then `npm run build` |

---

## Connecting to a Remote LM Studio Instance

If LM Studio is running on another machine on your local network (e.g. a more powerful desktop), set:

```env
MODEL_PROVIDER=lmstudio
MODEL_ID=llama-3.2-1b
LMSTUDIO_BASE_URL=http://192.168.1.50:1234/v1
```

Ensure the LM Studio server is configured to listen on all interfaces (not just localhost) in LM Studio's server settings.

---

## Switching Back to a Cloud Provider

Just update two variables in `.env`:

```env
MODEL_PROVIDER=openai
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

No code changes required.
