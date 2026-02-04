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


class PersonalRecord(BaseModel):
    """
    Represents a personal record (PR) for a user on an exercise.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='personal_records'
    )

    exercise_name = models.CharField(max_length=100)
    weight = models.DecimalField(max_digits=7, decimal_places=2)
    unit = models.CharField(max_length=10)
    achieved_date = models.DateField()

    class Meta:
        ordering = ['-achieved_date']

    def __str__(self):
        return f"{self.user.username} - {self.exercise_name}: {self.weight}{self.unit}"


class LeaderboardEntry(BaseModel):
    """
    Represents a leaderboard entry for a user.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='leaderboard_entries'
    )

    period = models.CharField(max_length=20)
    type = models.CharField(max_length=50)
    score = models.IntegerField()
    workout_count = models.IntegerField(default=0)
    total_duration = models.IntegerField(default=0)

    class Meta:
        ordering = ['-score']

    def __str__(self):
        return f"{self.user.username} - {self.period}: {self.score}"
