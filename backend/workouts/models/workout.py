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
        related_name='workouts'
    )
    gym = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workouts'
    )

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=50)

    duration = models.IntegerField()
    total_exercises = models.IntegerField()
    total_sets = models.IntegerField()

    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    date = models.DateField()

    is_template = models.BooleanField(default=False)
    template_name = models.CharField(max_length=100, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'date'],
                name='unique_workout_per_user_per_day'
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date}"


class Streak(BaseModel):
    """
    Represents a user's workout streak.
    """
    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='streak'
    )

    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    last_workout_date = models.DateField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-current_streak']

    def __str__(self):
        return f"{self.user.username} - {self.current_streak} day streak"
