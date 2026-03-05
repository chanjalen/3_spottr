from django.db import models
from common.models import BaseModel


class ExerciseCatalog(BaseModel):
    """
    A catalog of predefined exercises that users can choose from.
    These are the exercises shown in the "Add Exercise" modal.
    """

    class Category(models.TextChoices):
        CHEST = 'chest', 'Chest'
        BACK = 'back', 'Back'
        SHOULDERS = 'shoulders', 'Shoulders'
        BICEPS = 'biceps', 'Biceps'
        TRICEPS = 'triceps', 'Triceps'
        LEGS = 'legs', 'Legs'
        CORE = 'core', 'Core'
        CARDIO = 'cardio', 'Cardio'
        OTHER = 'other', 'Other'

    name = models.CharField(max_length=100)
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.OTHER,
    )
    description = models.TextField(blank=True)
    muscle_group = models.CharField(max_length=200, blank=True)  # primary muscles, comma-separated

    # Default values for this exercise
    default_sets = models.PositiveIntegerField(default=3)
    default_reps = models.PositiveIntegerField(default=10)
    default_weight = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    # For cardio exercises
    is_cardio = models.BooleanField(default=False)
    is_bodyweight = models.BooleanField(default=False)

    class Meta:
        ordering = ['category', 'name']
        verbose_name_plural = 'Exercise Catalog'

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class ExerciseSet(BaseModel):
    """
    Represents a single set within a workout exercise.
    Each exercise can have multiple sets with different reps/weights.
    """
    exercise = models.ForeignKey(
        'workouts.Exercise',
        on_delete=models.CASCADE,
        related_name='exercise_sets',
    )

    set_number = models.PositiveIntegerField()
    reps = models.PositiveIntegerField(default=0)
    weight = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    completed = models.BooleanField(default=False)

    class Meta:
        ordering = ['set_number']
        unique_together = ['exercise', 'set_number']

    def __str__(self):
        return f"Set {self.set_number}: {self.reps} reps @ {self.weight}"
