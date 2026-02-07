from django.db import models
from common.models import BaseModel


class Post(BaseModel):
    """
    Represents a feed post (workout share, check-in, etc.).
    """

    class Visibility(models.TextChoices):
        MAIN = 'main', 'Main'
        FRIENDS = 'friends', 'Friends'

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='posts',
    )
    workout = models.ForeignKey(
        'workouts.Workout',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts',
    )
    location = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts',
    )

    description = models.TextField()
    visibility = models.CharField(
        max_length=10,
        choices=Visibility.choices,
        default=Visibility.MAIN,
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='idx_post_user'),
            models.Index(fields=['visibility', '-created_at'], name='idx_post_visibility'),
        ]

    def __str__(self):
        return f"Post by {self.user.username}"
