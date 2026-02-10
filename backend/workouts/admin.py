from django.contrib import admin
from .models import Workout, Exercise, WorkoutTemplate, TemplateExercise, Streak, PersonalRecord, ExerciseCatalog, ExerciseSet


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


@admin.register(ExerciseCatalog)
class ExerciseCatalogAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'default_sets', 'default_reps', 'is_bodyweight', 'is_cardio']
    search_fields = ['name']
    list_filter = ['category', 'is_bodyweight', 'is_cardio']
    ordering = ['category', 'name']


@admin.register(ExerciseSet)
class ExerciseSetAdmin(admin.ModelAdmin):
    list_display = ['exercise', 'set_number', 'reps', 'weight', 'completed']
    search_fields = ['exercise__name']
    list_filter = ['completed']
