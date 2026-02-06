from django.db import models
from django.utils import timezone
from common.models import BaseModel


class User(BaseModel):
    """
    Represents a Spottr user profile.
    Stores authentication and fitness-related metadata.
    """

    class Status(models.TextChoices):
        ONLINE = 'online', 'Online'
        OFFLINE = 'offline', 'Offline'
        WORKING_OUT = 'working_out', 'Working Out'
        DEACTIVATED = 'deactivated', 'Deactivated'

    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, unique=True)
    password = models.CharField(max_length=128)

    username = models.CharField(max_length=30, unique=True)
    display_name = models.CharField(max_length=50)
    birthday = models.DateField()

    bio = models.TextField(max_length=500, blank=True)

    workout_frequency = models.IntegerField(default=0)
    member_since = models.DateTimeField(default=timezone.now)

    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    total_workouts = models.IntegerField(default=0)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OFFLINE,
    )

    enrolled_gym = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enrolled_users',
    )

    class Meta:
        ordering = ['username']

    def __str__(self):
        return self.username
