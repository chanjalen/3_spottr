from django.db import models
from common.models import BaseModel


class RestDay(BaseModel):
    """
    Records a rest day taken by a user on a specific streak date.
    Rest days protect streaks when users need a break.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='rest_days',
    )
    streak_date = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'streak_date'],
                name='unique_user_rest_day',
            )
        ]
        ordering = ['-streak_date']

    def __str__(self):
        return f"{self.user.username} - rest day {self.streak_date}"
