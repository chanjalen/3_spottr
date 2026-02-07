from django.db import models
from common.models import BaseModel


class Workout(BaseModel):
    """
    Represents a logged workout session completed by a user.
    Each workout belongs to one user and may optionally occur at a gym.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='workouts',
    )
    gym = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workouts',
    )
    template = models.ForeignKey(
        'workouts.WorkoutTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workouts',
    )

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=50)
    duration = models.DurationField()
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['user', '-start_time'], name='idx_workout_user'),
            models.Index(fields=['gym', '-start_time'], name='idx_workout_gym'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='workout_end_after_start',
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.name}"


class Streak(BaseModel):
    """
    Tracks the last workout date for a user to calculate streaks.
    current_streak and longest_streak live on the User model.
    """
    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='streak',
    )
    last_workout_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - last workout {self.last_workout_date}"
