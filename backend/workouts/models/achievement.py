from django.db import models
from common.models import BaseModel


class AchievementStat(BaseModel):
    """Global counter tracking how many users have earned each achievement."""
    achievement_id = models.CharField(max_length=50, unique=True)
    earned_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['achievement_id']

    def __str__(self):
        return f"{self.achievement_id}: {self.earned_count}"


class UserAchievement(BaseModel):
    """Records which achievements a specific user has earned.

    Used to detect newly-earned achievements so we only increment AchievementStat once.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='user_achievements',
    )
    achievement_id = models.CharField(max_length=50)

    class Meta:
        unique_together = ('user', 'achievement_id')
        ordering = ['achievement_id']

    def __str__(self):
        return f"{self.user.username} — {self.achievement_id}"
