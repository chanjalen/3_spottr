from rest_framework import serializers
from .models import Workout, Exercise, Streak


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = [
            'id', 'workout', 'name', 'category', 'sets', 'reps', 'weight',
            'unit', 'duration', 'distance', 'order', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkoutSerializer(serializers.ModelSerializer):
    exercises = ExerciseSerializer(many=True, read_only=True)

    class Meta:
        model = Workout
        fields = [
            'id', 'user', 'gym', 'name', 'type', 'duration', 'total_exercises',
            'total_sets', 'start_time', 'end_time', 'date', 'is_template',
            'template_name', 'notes', 'exercises', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = Streak
        fields = [
            'id', 'user', 'current_streak', 'longest_streak',
            'last_workout_date', 'start_date', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
