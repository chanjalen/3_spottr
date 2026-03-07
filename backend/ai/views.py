"""
AI views for Spottr — Assignment 6: Text Intelligence

POST /api/ai/workout-summary/  — local TinyLlama (transformers)
    Accepts: {"request": "<free-text workout request, e.g. 'back and bi routine'>"}
    Returns: a structured workout routine

POST /api/ai/workout-coach/    — Groq Cloud API (llama-3.1-8b-instant)
    Accepts: {"request": "<free-text workout request>"}
    Returns: a detailed workout plan with sets, reps, and tips

Safety guardrails:
- Input capped at 500 characters to prevent prompt injection via oversized payloads
- System prompt constrains the model to fitness-only output
- Output length capped at 600 chars
- Basic sanitisation: strip leading/trailing whitespace
- API key is read from environment — never from request
"""

import json
import os

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

# ── Lazy-loaded local pipeline ─────────────────────────────────────────────
_local_pipeline = None


def _get_local_pipeline():
    """Load TinyLlama once on first request; reuse on subsequent calls."""
    global _local_pipeline
    if _local_pipeline is None:
        import torch
        from transformers import pipeline

        dtype = (
            torch.float16
            if (torch.backends.mps.is_available() or torch.cuda.is_available())
            else torch.float32
        )
        _local_pipeline = pipeline(
            "text-generation",
            model="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
            torch_dtype=dtype,
            device_map="auto",
        )
    return _local_pipeline


# ── Few-shot examples for the local model ─────────────────────────────────
FEW_SHOT_EXAMPLES = [
    {
        "role": "user",
        "content": "Give me a chest and tricep routine",
    },
    {
        "role": "assistant",
        "content": (
            "Chest & Triceps Routine:\n"
            "1. Bench Press — 4x8\n"
            "2. Incline Dumbbell Press — 3x10\n"
            "3. Cable Fly — 3x12\n"
            "4. Tricep Pushdown — 3x12\n"
            "5. Overhead Tricep Extension — 3x10\n"
            "Rest 60-90s between sets. Great for building upper body pushing strength!"
        ),
    },
    {
        "role": "user",
        "content": "I want a leg day workout",
    },
    {
        "role": "assistant",
        "content": (
            "Leg Day Routine:\n"
            "1. Barbell Squat — 4x6\n"
            "2. Romanian Deadlift — 3x10\n"
            "3. Leg Press — 3x12\n"
            "4. Walking Lunges — 3x12 each leg\n"
            "5. Leg Curl — 3x12\n"
            "Rest 90s between sets. This hits quads, hamstrings, and glutes!"
        ),
    },
    {
        "role": "user",
        "content": "Can you give me a quick 20 minute HIIT workout",
    },
    {
        "role": "assistant",
        "content": (
            "20-Minute HIIT:\n"
            "4 rounds of (40s on / 20s rest):\n"
            "1. Burpees\n"
            "2. Jump Squats\n"
            "3. Push-Ups\n"
            "4. Mountain Climbers\n"
            "5. High Knees\n"
            "Rest 1 min between rounds. Maximize effort on each interval!"
        ),
    },
]

SYSTEM_MSG = (
    "You are a fitness coach assistant for the Spottr workout tracking app. "
    "Generate a clear, structured workout routine based on the user's request. "
    "Format it as a numbered list of exercises with sets and reps. "
    "End with one short motivational tip. "
    "Only respond to fitness-related requests. Do not include harmful or off-topic content."
)


def _build_messages(request_text: str) -> list:
    return (
        [{"role": "system", "content": SYSTEM_MSG}]
        + FEW_SHOT_EXAMPLES
        + [{"role": "user", "content": request_text}]
    )


def _sanitise_input(raw: str) -> str:
    """Strip whitespace and cap length to prevent prompt injection."""
    return raw.strip()[:500]


def _sanitise_output(text: str) -> str:
    return text.strip()[:600] if text else "Great workout! Keep up the hard work."


# ── View 1: Local TinyLlama ────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["POST"])
def workout_summary_local(request):
    """
    Generate a workout summary using the locally hosted TinyLlama-1.1B-Chat model.

    Data flow:
        React Native app  →  POST JSON  →  Django view
        →  few-shot prompt  →  TinyLlama (local)
        →  cleaned summary string  →  JSON response
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    request_text = data.get("request", data.get("workout_text", "")).strip()
    if not request_text:
        return JsonResponse({"error": "request is required"}, status=400)

    request_text = _sanitise_input(request_text)

    try:
        pipe = _get_local_pipeline()
        messages = _build_messages(request_text)
        raw = pipe(messages, max_new_tokens=200, do_sample=False)

        # Extract assistant reply from chat-formatted output
        generated = raw[0]["generated_text"]
        if isinstance(generated, list):
            summary = generated[-1].get("content", "")
        else:
            summary = generated

        summary = _sanitise_output(summary)
        return JsonResponse({"routine": summary, "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0"})

    except Exception as e:
        return JsonResponse({"error": f"Model inference failed: {e}"}, status=500)


# ── View 2: Groq Cloud API ─────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(["POST"])
def workout_coach_api(request):
    """
    Generate personalised coaching advice using the Groq API (llama3-8b-8192).

    Data flow:
        React Native app  →  POST JSON  →  Django view
        →  system + user prompt  →  Groq API (cloud)
        →  cleaned advice string  →  JSON response

    Requires GROQ_API_KEY in backend/.env
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    request_text = data.get("request", data.get("workout_text", "")).strip()
    if not request_text:
        return JsonResponse({"error": "request is required"}, status=400)

    request_text = _sanitise_input(request_text)

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return JsonResponse({"error": "GROQ_API_KEY is not configured on this server"}, status=503)

    try:
        import groq

        client = groq.Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert fitness coach for the Spottr workout tracking app. "
                        "Generate a detailed, structured workout routine based on the user's request. "
                        "Format it as a numbered list with exercise name, sets, reps, and a brief tip. "
                        "End with one motivational sentence. Only respond to fitness-related requests."
                    ),
                },
                {
                    "role": "user",
                    "content": request_text,
                },
            ],
            max_tokens=400,
        )
        routine = _sanitise_output(response.choices[0].message.content)
        return JsonResponse({"routine": routine, "model": "llama-3.1-8b-instant (Groq)"})

    except Exception as e:
        return JsonResponse({"error": f"Groq API call failed: {e}"}, status=502)
