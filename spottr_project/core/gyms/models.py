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

    max_capacity = models.IntegerField()
    current_activity = models.IntegerField(default=0)

    phone_number = models.CharField(max_length=20, blank=True)
    hours = models.JSONField(default=dict)
    amenities = models.JSONField(default=list)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class GymActivity(BaseModel):
    """
    Tracks user activity at a specific gym.
    """
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='activities'
    )

    timestamp = models.DateTimeField()
    activity_count = models.IntegerField(default=0)

    legs_count = models.IntegerField(default=0)
    cardio_count = models.IntegerField(default=0)
    workout_class_count = models.IntegerField(default=0)
    other_count = models.IntegerField(default=0)

    busyness_level = models.CharField(max_length=20)

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
        related_name='workout_invites'
    )
    gym = models.ForeignKey(
        Gym,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workout_invites'
    )

    workout_type = models.CharField(max_length=50)
    scheduled_time = models.DateTimeField()
    spots_available = models.IntegerField(default=1)

    status = models.CharField(max_length=20, default='open')
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-scheduled_time']

    def __str__(self):
        return f"{self.user.username} - {self.workout_type}"


class InviteParticipant(BaseModel):
    """
    Represents a participant in a workout invite.
    """
    invite = models.ForeignKey(
        WorkoutInvite,
        on_delete=models.CASCADE,
        related_name='participants'
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='invite_participations'
    )

    status = models.CharField(max_length=20, default='pending')
    joined_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['invite', 'user'],
                name='unique_participant_per_invite'
            )
        ]

    def __str__(self):
        return f"{self.user.username} in {self.invite.id}"
