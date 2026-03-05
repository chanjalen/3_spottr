from django.db import models
from django.db.models import Q
from common.models import BaseModel



class QuickWorkout(BaseModel):
    """
    A lightweight workout post — quick check-in without a full workout log.
    Check-ins always appear in the Friends/Groups feed, never the Main feed.
    """

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='quick_workouts',
    )
    location = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quick_workouts',
    )
    # Optionally link a full logged workout session to this check-in.
    workout = models.ForeignKey(
        'workouts.Workout',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checkins',
    )
    location_name = models.CharField(max_length=100, blank=True)

    description = models.TextField(blank=True)
    type = models.CharField(max_length=50)

    audience = models.JSONField(default=list)
    is_front_camera = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='idx_quick_workout_user'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(location__isnull=False) | ~Q(location_name='')
                ),
                name='quick_workout_requires_location',
            )
        ]

    def __str__(self):
        return f"Quick workout by {self.user.username}"
