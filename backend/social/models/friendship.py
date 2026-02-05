from django.db import models
from common.models import BaseModel


class Friendship(BaseModel):
    """
    Represents a friendship connection between two users.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='friendships'
    )
    friend = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='friend_of'
    )

    status = models.CharField(max_length=20, default='pending')

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'friend'],
                name='unique_friendship'
            )
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.friend.username}"


class LeaderboardEntry(BaseModel):
    """
    Represents a leaderboard ranking entry.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='leaderboard_entries'
    )

    period = models.CharField(max_length=20)
    rank = models.IntegerField()
    score = models.IntegerField()
    workout_count = models.IntegerField(default=0)
    total_duration = models.IntegerField(default=0)

    class Meta:
        ordering = ['-score']

    def __str__(self):
        return f"{self.user.username} - {self.period}: {self.score}"
