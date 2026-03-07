from django.urls import path
from . import views

urlpatterns = [
    # Local HuggingFace model — workout summary
    path("workout-summary/", views.workout_summary_local, name="ai_workout_summary"),
    # External Groq API — coaching advice
    path("workout-coach/", views.workout_coach_api, name="ai_workout_coach"),
]
