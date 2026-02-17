from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from common.models import generate_uuid
from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model for Spottr.
    Extends AbstractBaseUser for real authentication (password hashing, sessions).
    """

    class Status(models.TextChoices):
        ONLINE = 'online', 'Online'
        OFFLINE = 'offline', 'Offline'
        WORKING_OUT = 'working_out', 'Working Out'
        DEACTIVATED = 'deactivated', 'Deactivated'

    # Primary key + timestamps (replaces BaseModel inheritance)
    id = models.CharField(primary_key=True, max_length=36, default=generate_uuid)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Auth fields
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, unique=True)
    username = models.CharField(max_length=30, unique=True)

    # Profile fields
    display_name = models.CharField(max_length=50)
    birthday = models.DateField()
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.TextField(max_length=500, blank=True)

    # Fitness stats
    workout_frequency = models.IntegerField(default=0)
    member_since = models.DateTimeField(default=timezone.now)
    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    total_workouts = models.IntegerField(default=0)

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OFFLINE,
    )

    # Gym enrollment
    enrolled_gyms = models.ManyToManyField(
        'gyms.Gym',
        blank=True,
        related_name='enrolled_users',
    )

    # ── Preferences ──
    weekly_workout_goal = models.IntegerField(default=4)
    weight_unit = models.CharField(
        max_length=5,
        choices=[('lbs', 'Pounds (lbs)'), ('kg', 'Kilograms (kg)')],
        default='lbs',
    )
    distance_unit = models.CharField(
        max_length=5,
        choices=[('miles', 'Miles'), ('km', 'Kilometers')],
        default='miles',
    )

    # ── Privacy ──
    profile_visibility = models.CharField(
        max_length=10,
        choices=[('public', 'Public - Anyone can view'), ('friends', 'Friends Only'), ('private', 'Only Me')],
        default='public',
    )
    workout_post_visibility = models.CharField(
        max_length=10,
        choices=[('public', 'Public'), ('friends', 'Friends Only'), ('private', 'Only Me')],
        default='friends',
    )
    show_streak = models.BooleanField(default=True)
    show_personal_records = models.BooleanField(default=True)
    allow_friend_requests = models.BooleanField(default=True)
    show_online_status = models.BooleanField(default=True)

    # ── Notifications ──
    notify_friend_workouts = models.BooleanField(default=True)
    notify_zaps = models.BooleanField(default=True)
    notify_comments = models.BooleanField(default=True)
    notify_reactions = models.BooleanField(default=True)
    notify_friend_requests = models.BooleanField(default=True)
    notify_workout_reminders = models.BooleanField(default=True)
    notify_workout_invites = models.BooleanField(default=True)
    notify_group_messages = models.BooleanField(default=True)
    notify_leaderboard_updates = models.BooleanField(default=False)
    push_notifications = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)

    # Required by AbstractBaseUser
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email', 'phone_number', 'display_name', 'birthday']

    class Meta:
        ordering = ['username']

    @property
    def avatar_url(self):
        from media.utils import get_media_url, build_media_url
        url = get_media_url('user', self.pk, 'avatar')
        if url:
            return url
        # Fallback to the ImageField for legacy avatars
        if self.avatar:
            return build_media_url(self.avatar.name)
        return ''

    def __str__(self):
        return self.username