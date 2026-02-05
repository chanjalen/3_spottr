from django.db import models
from common.models import BaseModel


class Post(BaseModel):
    """
    Represents a feed post (workout share, check-in, PR, streak).
    The social tracking feature of the app.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='posts'
    )
    workout = models.ForeignKey(
        'workouts.Workout',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts'
    )
    location = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts'
    )

    type = models.CharField(max_length=50)
    content = models.TextField()

    pr_exercise = models.CharField(max_length=100, blank=True)
    pr_weight = models.CharField(max_length=20, blank=True)
    streak_days = models.IntegerField(null=True, blank=True)

    visibility = models.CharField(max_length=20)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Post by {self.user.username}"
