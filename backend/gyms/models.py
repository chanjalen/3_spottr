from django.db import models
from common.models import BaseModel


class Gym(BaseModel):
    """
    Represents a physical gym location where users can work out.
    """
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255)

    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    website = models.URLField(max_length=255, null=True, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    hours = models.JSONField(default=dict)
    amenities = models.JSONField(default=list)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class BusyLevel(BaseModel):
    """
    Stores crowd-sourced busy level survey responses for a gym.
    """
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='busy_levels',
    )
    timestamp = models.DateTimeField()
    survey_response = models.IntegerField()

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.gym.name} - {self.timestamp}"


class WorkoutInvite(BaseModel):
    """
    Represents an invitation to work out together.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='workout_invites',
    )
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='workout_invites',
    )
    group = models.ForeignKey(
        'groups.Group',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='workout_invites',
    )

    description = models.CharField(max_length=255)
    workout_type = models.CharField(max_length=50)
    scheduled_time = models.DateTimeField()
    spots_available = models.IntegerField(default=1)
    type = models.CharField(max_length=50)  # gym invite, group/individual invite
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-scheduled_time']

    def __str__(self):
        return f"{self.user.username} - {self.workout_type}"


class JoinRequest(BaseModel):
    """
    Represents a request to join a workout invite.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPT = 'accept', 'Accept'
        DENY = 'deny', 'Deny'

    workout_invite = models.ForeignKey(
        WorkoutInvite,
        on_delete=models.CASCADE,
        related_name='join_requests',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='join_requests',
    )

    description = models.CharField(max_length=255)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    joined_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.workout_invite.id}"
