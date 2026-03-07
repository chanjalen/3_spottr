"""
AI views for Spottr — Assignment 6: Text Intelligence

POST /api/ai/workout-summary/  — local TinyLlama (transformers)
POST /api/ai/workout-coach/    — Groq Cloud API (llama3-8b-8192)

Both endpoints accept:
    {"workout_text": "<free-text description of the workout>"}

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
        "content": "Workout: 5 sets squat 185 lbs x 5, 3 sets leg press 270 lbs x 10",
    },
    {
        "role": "assistant",
        "content": (
            "Incredible leg day — 5 sets of squats at 185 lbs plus leg press shows real dedication. "
            "You moved serious weight today. Keep building that base!"
        ),
    },
    {
        "role": "user",
        "content": "Workout: 30 min run 3.2 miles, 100 push-ups in 4 sets",
    },
    {
        "role": "assistant",
        "content": (
            "A 3.2-mile run combined with 100 push-ups is a well-rounded cardio and strength combo. "
            "You challenged both your aerobic system and your upper body. That consistency pays off!"
        ),
    },
    {
        "role": "user",
        "content": "Workout: 4 sets dumbbell curl 40 lbs x 10, 3 sets tricep pushdown 60 lbs x 12",
    },
    {
        "role": "assistant",
        "content": (
            "Focused arm work today — curls and tricep pushdowns for total arm development. "
            "Isolation sessions like this build the detail that compound lifts can't always reach. "
            "You're sculpting something great!"
        ),
    },
]

SYSTEM_MSG = (
    "You are a fitness coach assistant for the Spottr workout tracking app. "
    "Write a motivational workout summary in exactly 2-3 sentences. "
    "Mention the specific exercises. End with an encouraging sentence. "
    "Do not include any harmful, off-topic, or unsafe content."
)


def _build_messages(workout_text: str) -> list:
    return (
        [{"role": "system", "content": SYSTEM_MSG}]
        + FEW_SHOT_EXAMPLES
        + [{"role": "user", "content": f"Workout: {workout_text}"}]
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

    workout_text = data.get("workout_text", "").strip()
    if not workout_text:
        return JsonResponse({"error": "workout_text is required"}, status=400)

    workout_text = _sanitise_input(workout_text)

    try:
        pipe = _get_local_pipeline()
        messages = _build_messages(workout_text)
        raw = pipe(messages, max_new_tokens=120, do_sample=False)

        # Extract assistant reply from chat-formatted output
        generated = raw[0]["generated_text"]
        if isinstance(generated, list):
            summary = generated[-1].get("content", "")
        else:
            summary = generated

        summary = _sanitise_output(summary)
        return JsonResponse({"summary": summary, "model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0"})

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

    workout_text = data.get("workout_text", "").strip()
    if not workout_text:
        return JsonResponse({"error": "workout_text is required"}, status=400)

    workout_text = _sanitise_input(workout_text)

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
                        "Provide specific, actionable coaching advice based on the user's workout. "
                        "Highlight key achievements, suggest one improvement, and be encouraging. "
                        "Keep your response to 3-5 sentences. Do not produce off-topic content."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Based on this workout, give me key achievements and what to focus on next: {workout_text}"
                    ),
                },
            ],
            max_tokens=200,
        )
        advice = _sanitise_output(response.choices[0].message.content)
        return JsonResponse({"advice": advice, "model": "llama3-8b-8192 (Groq)"})

    except Exception as e:
        return JsonResponse({"error": f"Groq API call failed: {e}"}, status=502)
