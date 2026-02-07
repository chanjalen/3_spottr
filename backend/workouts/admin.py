from django.contrib import admin
from .models import Workout, Exercise, WorkoutTemplate, TemplateExercise, Streak, PersonalRecord


@admin.register(Workout)
class WorkoutAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'type', 'start_time', 'duration']
    search_fields = ['name', 'user__username']
    list_filter = ['type']


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ['name', 'workout', 'category', 'sets', 'reps', 'weight']
    search_fields = ['name', 'category']
    list_filter = ['category']


@admin.register(WorkoutTemplate)
class WorkoutTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'visibility', 'created_at']
    search_fields = ['name', 'user__username']
    list_filter = ['visibility']


@admin.register(TemplateExercise)
class TemplateExerciseAdmin(admin.ModelAdmin):
    list_display = ['name', 'template', 'category', 'sets', 'reps', 'weight']
    search_fields = ['name']


@admin.register(Streak)
class StreakAdmin(admin.ModelAdmin):
    list_display = ['user', 'last_workout_date']
    search_fields = ['user__username']


@admin.register(PersonalRecord)
class PersonalRecordAdmin(admin.ModelAdmin):
    list_display = ['user', 'exercise_name', 'value', 'unit', 'achieved_date']
    search_fields = ['user__username', 'exercise_name']
    list_filter = ['exercise_name', 'achieved_date']
