from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.urls import reverse
from common.models import BaseModel


class Gym(BaseModel):
    """
    Represents a physical gym location where users can work out.
    """
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255, null=True, blank=True)

    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    website = models.URLField(max_length=255, null=True, blank=True)
    phone_number = models.CharField(max_length=20, null=True, blank=True)
    hours = models.JSONField(default=dict, null=True, blank=True)
    amenities = models.JSONField(default=list, null=True, blank=True)

    # Google Places integration (for future API use)
    google_place_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    # Ratings from Google Places
    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    rating_count = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('gyms:gym_detail', kwargs={'pk': self.pk})


class BusyLevel(BaseModel):
    """
    Stores crowd-sourced busy level survey responses for a gym.
    Scale: 1=Empty, 2=Not busy, 3=Moderate, 4=Busy, 5=Packed
    """
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='busy_levels',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='busy_level_responses',
    )
    timestamp = models.DateTimeField()
    survey_response = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

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
    invited_user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='received_workout_invites',
    )

    workout_chat = models.ForeignKey(
        'groups.Group',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workout_invite',
    )

    description = models.CharField(max_length=255)
    workout_type = models.CharField(max_length=50)
    scheduled_time = models.DateTimeField()
    spots_available = models.IntegerField(default=1)
    total_spots = models.IntegerField(default=1)
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
