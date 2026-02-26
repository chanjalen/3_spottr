from django.db import models
from common.models import BaseModel
from .workout import Workout


class Exercise(BaseModel):
    """
    Represents an exercise performed as part of a workout.
    Multiple exercises can belong to a single workout.
    """
    workout = models.ForeignKey(
        Workout,
        on_delete=models.CASCADE,
        related_name='exercises'
    )

    name = models.CharField(max_length=100)
    category = models.CharField(max_length=50)

    sets = models.IntegerField()
    reps = models.IntegerField()
    weight = models.DecimalField(max_digits=6, decimal_places=2)

    unit = models.CharField(max_length=10)

    duration = models.IntegerField(null=True, blank=True)
    distance = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    order = models.IntegerField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.name} ({self.workout.id})"
