# Spottr AI Integration — README_AI.md

## System Description

### Feature
After a user logs a workout in the Spottr app, the AI layer generates:
1. A **motivational summary** (local TinyLlama model, `POST /api/ai/workout-summary/`)
2. **Coaching advice** — key achievements + next steps (Groq API, `POST /api/ai/workout-coach/`)

---

## Data Input

The React Native app sends a `POST` request with a JSON body:

```json
{
  "workout_text": "5 sets bench press 185 lbs x 8 reps, 3 sets OHP 95 lbs x 10 reps"
}
```

This string is assembled in the mobile app from the user's logged sets, reps, and weights
(already stored in the `Workout` / `QuickWorkout` model). The text is plain English and
requires no special formatting from the user.

---

## Preprocessing

1. **Strip whitespace** — leading/trailing spaces are removed.
2. **Length cap** — input is truncated to 500 characters. This prevents oversized payloads
   from injecting large adversarial prompts and keeps inference time predictable.
3. **Few-shot prompt injection** — the cleaned workout string is inserted as the final user
   message in a pre-built few-shot conversation (3 example pairs). This frames the model's
   expected output style before it generates.

---

## Safety Guardrails

| Threat | Mitigation |
|--------|-----------|
| Prompt injection via oversized input | Hard 500-char input cap in `_sanitise_input()` |
| Model producing off-topic/harmful text | System prompt constrains scope to fitness summaries only |
| Model producing empty output | Fallback string: "Great workout! Keep up the hard work." |
| API key exposure | Key is read from `backend/.env` via `os.environ` — never from request |
| Broken JSON body | `json.JSONDecodeError` caught and returns HTTP 400 |
| Groq API down | Exception caught, returns HTTP 502 with error message |
| Output too long | Output capped to 600 chars in `_sanitise_output()` |

---

## Local LLM Integration — `TinyLlama/TinyLlama-1.1B-Chat-v1.0`

**File:** `backend/ai/views.py` → `workout_summary_local()`

The `transformers` library downloads the model weights automatically on first request
(~1.1 GB, stored in `~/.cache/huggingface/`). The pipeline is **lazy-loaded** and cached
in a module-level variable so subsequent requests reuse the same in-memory model.

```
POST /api/ai/workout-summary/
Body: {"workout_text": "..."}
→ few-shot prompt (3 examples)
→ TinyLlama-1.1B-Chat (local, MPS on Apple Silicon)
→ {"summary": "...", "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0"}
```

**Why TinyLlama?** Selected from the 15-model benchmark in `llm-test/ai_prototype.ipynb`.
Best speed/quality ratio for local inference — runs on M2 Mac in ~2–3 s with no GPU required.

---

## API Integration — Groq Cloud API (`llama3-8b-8192`)

**File:** `backend/ai/views.py` → `workout_coach_api()`

Uses the [Groq](https://console.groq.com) free-tier API. Groq runs LLaMA 3 8B at very
high speed (<1 s latency) at no cost up to 14,400 requests/day on the free plan.

```
POST /api/ai/workout-coach/
Body: {"workout_text": "..."}
→ system prompt + user message
→ Groq API → llama3-8b-8192 (cloud)
→ {"advice": "...", "model": "llama3-8b-8192 (Groq)"}
```

**Hybrid pipeline:** The local model handles the quick summary (always available, offline),
while the Groq API provides the deeper coaching advice (requires network). If Groq is
unavailable, the app falls back to displaying the local summary only.

---

## Setup

```bash
# 1. Install AI dependencies
pip install transformers torch accelerate groq

# 2. Add your Groq API key to backend/.env
echo "GROQ_API_KEY=your_key_here" >> backend/.env

# 3. Run the server — TinyLlama downloads automatically on first request
python manage.py runserver
```

Get a free Groq API key at: https://console.groq.com
