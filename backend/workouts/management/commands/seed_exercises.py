from django.core.management.base import BaseCommand
from workouts.models import ExerciseCatalog


class Command(BaseCommand):
    help = 'Seeds the database with predefined exercises'

    def handle(self, *args, **options):
        exercises = [
            # Chest
            {'name': 'Bench Press', 'category': 'chest', 'default_sets': 4, 'default_reps': 8},
            {'name': 'Incline Bench Press', 'category': 'chest', 'default_sets': 4, 'default_reps': 8},
            {'name': 'Dumbbell Press', 'category': 'chest', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Incline Dumbbell Press', 'category': 'chest', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Cable Fly', 'category': 'chest', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Dumbbell Fly', 'category': 'chest', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Push Ups', 'category': 'chest', 'default_sets': 3, 'default_reps': 15, 'is_bodyweight': True},
            {'name': 'Chest Dips', 'category': 'chest', 'default_sets': 3, 'default_reps': 10, 'is_bodyweight': True},
            {'name': 'Machine Chest Press', 'category': 'chest', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Pec Deck', 'category': 'chest', 'default_sets': 3, 'default_reps': 12},

            # Back
            {'name': 'Deadlift', 'category': 'back', 'default_sets': 4, 'default_reps': 5},
            {'name': 'Pull Ups', 'category': 'back', 'default_sets': 3, 'default_reps': 8, 'is_bodyweight': True},
            {'name': 'Barbell Row', 'category': 'back', 'default_sets': 4, 'default_reps': 8},
            {'name': 'Dumbbell Row', 'category': 'back', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Lat Pulldown', 'category': 'back', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Seated Cable Row', 'category': 'back', 'default_sets': 3, 'default_reps': 10},
            {'name': 'T-Bar Row', 'category': 'back', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Chin Ups', 'category': 'back', 'default_sets': 3, 'default_reps': 8, 'is_bodyweight': True},
            {'name': 'Face Pulls', 'category': 'back', 'default_sets': 3, 'default_reps': 15},
            {'name': 'Hyperextensions', 'category': 'back', 'default_sets': 3, 'default_reps': 12},

            # Shoulders
            {'name': 'Overhead Press', 'category': 'shoulders', 'default_sets': 4, 'default_reps': 8},
            {'name': 'Dumbbell Shoulder Press', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Lateral Raises', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Front Raises', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Rear Delt Fly', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Arnold Press', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Upright Row', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Shrugs', 'category': 'shoulders', 'default_sets': 3, 'default_reps': 12},

            # Arms
            {'name': 'Barbell Curl', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Dumbbell Curl', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Hammer Curl', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Preacher Curl', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Cable Curl', 'category': 'arms', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Tricep Pushdown', 'category': 'arms', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Tricep Dips', 'category': 'arms', 'default_sets': 3, 'default_reps': 10, 'is_bodyweight': True},
            {'name': 'Skull Crushers', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Overhead Tricep Extension', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Close Grip Bench Press', 'category': 'arms', 'default_sets': 3, 'default_reps': 10},

            # Legs
            {'name': 'Squat', 'category': 'legs', 'default_sets': 4, 'default_reps': 8},
            {'name': 'Leg Press', 'category': 'legs', 'default_sets': 4, 'default_reps': 10},
            {'name': 'Romanian Deadlift', 'category': 'legs', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Leg Curl', 'category': 'legs', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Leg Extension', 'category': 'legs', 'default_sets': 3, 'default_reps': 12},
            {'name': 'Lunges', 'category': 'legs', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Bulgarian Split Squat', 'category': 'legs', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Calf Raises', 'category': 'legs', 'default_sets': 4, 'default_reps': 15},
            {'name': 'Hip Thrust', 'category': 'legs', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Goblet Squat', 'category': 'legs', 'default_sets': 3, 'default_reps': 12},

            # Core
            {'name': 'Plank', 'category': 'core', 'default_sets': 3, 'default_reps': 1, 'is_bodyweight': True},
            {'name': 'Crunches', 'category': 'core', 'default_sets': 3, 'default_reps': 20, 'is_bodyweight': True},
            {'name': 'Russian Twist', 'category': 'core', 'default_sets': 3, 'default_reps': 20},
            {'name': 'Leg Raises', 'category': 'core', 'default_sets': 3, 'default_reps': 15, 'is_bodyweight': True},
            {'name': 'Mountain Climbers', 'category': 'core', 'default_sets': 3, 'default_reps': 20, 'is_bodyweight': True},
            {'name': 'Ab Wheel Rollout', 'category': 'core', 'default_sets': 3, 'default_reps': 10},
            {'name': 'Cable Crunch', 'category': 'core', 'default_sets': 3, 'default_reps': 15},
            {'name': 'Dead Bug', 'category': 'core', 'default_sets': 3, 'default_reps': 10, 'is_bodyweight': True},

            # Cardio
            {'name': 'Treadmill', 'category': 'cardio', 'is_cardio': True},
            {'name': 'Cycling', 'category': 'cardio', 'is_cardio': True},
            {'name': 'Rowing Machine', 'category': 'cardio', 'is_cardio': True},
            {'name': 'Stair Climber', 'category': 'cardio', 'is_cardio': True},
            {'name': 'Elliptical', 'category': 'cardio', 'is_cardio': True},
            {'name': 'Jump Rope', 'category': 'cardio', 'is_cardio': True, 'is_bodyweight': True},
            {'name': 'Burpees', 'category': 'cardio', 'default_sets': 3, 'default_reps': 10, 'is_cardio': True, 'is_bodyweight': True},
        ]

        created_count = 0
        for exercise_data in exercises:
            obj, created = ExerciseCatalog.objects.get_or_create(
                name=exercise_data['name'],
                defaults=exercise_data
            )
            if created:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(f'Successfully seeded {created_count} new exercises (total: {len(exercises)})')
        )
