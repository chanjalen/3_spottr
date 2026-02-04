from django.db import models
from django.utils import timezone
from common.models import BaseModel


class User(BaseModel):
    """
    Represents a Spottr user profile.
    Stores authentication and fitness-related metadata.
    """
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, unique=True)
    password = models.CharField(max_length=128)

    username = models.CharField(max_length=30, unique=True)
    display_name = models.CharField(max_length=50)
    birthday = models.DateField(null=True, blank=True)

    avatar = models.CharField(max_length=255, null=True, blank=True)
    bio = models.TextField(blank=True)

    workout_frequency = models.IntegerField(default=0)
    member_since = models.DateTimeField(default=timezone.now)

    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    total_workouts = models.IntegerField(default=0)

    status = models.CharField(max_length=50, blank=True)
    current_activity = models.CharField(max_length=100, blank=True)

    current_gym = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='current_users'
    )

    class Meta:
        ordering = ['username']

    def __str__(self):
        return self.username
