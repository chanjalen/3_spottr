from django.db import models
from common.models import BaseModel


class LeaderboardEntry(BaseModel):
    """
    Represents a leaderboard ranking entry for a user at a gym.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='leaderboard_entries',
    )
    streak = models.ForeignKey(
        'workouts.Streak',
        on_delete=models.CASCADE,
        related_name='leaderboard_entries',
    )
    gym = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.CASCADE,
        related_name='leaderboard_entries',
    )

    rank = models.PositiveIntegerField()

    class Meta:
        ordering = ['rank']
        indexes = [
            models.Index(fields=['gym', 'rank'], name='idx_leaderboard_gym_rank'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'gym'],
                name='unique_leaderboard_entry_per_gym',
            )
        ]

    def __str__(self):
        return f"{self.user.username} - rank {self.rank}"
