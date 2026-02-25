from django.urls import path
from . import views

app_name = 'workouts_api'

urlpatterns = [
    path('<str:workout_id>/detail/', views.workout_detail, name='workout_detail'),
]
