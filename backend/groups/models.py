import string
import secrets

from django.db import models
from django.db.models import Case, When, IntegerField, Q
from common.models import BaseModel


def generate_invite_code():
    """Generate a random 8-character alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


class Group(BaseModel):
    """
    Represents a group that users can join.
    """

    class Privacy(models.TextChoices):
        PUBLIC = 'public', 'Public'
        PRIVATE = 'private', 'Private'

    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='created_groups',
    )

    name = models.CharField(max_length=100)
    description = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='group_avatars/', null=True, blank=True)
    group_streak = models.IntegerField(default=0)
    longest_group_streak = models.IntegerField(default=0)
    last_streak_date = models.DateField(null=True, blank=True)
    privacy = models.CharField(
        max_length=10,
        choices=Privacy.choices,
        default=Privacy.PUBLIC,
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class GroupMemberManager(models.Manager):
    """Orders members by role: creator → admin → member, then by most recent join."""

    def get_queryset(self):
        return super().get_queryset().annotate(
            role_order=Case(
                When(role='creator', then=0),
                When(role='admin', then=1),
                When(role='member', then=2),
                output_field=IntegerField(),
            )
        ).order_by('role_order', '-joined_at')


class GroupMember(BaseModel):
    """
    Represents a user's membership in a group.
    """

    class Role(models.TextChoices):
        CREATOR = 'creator', 'Creator'
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='members',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='group_memberships',
    )

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    objects = GroupMemberManager()

    class Meta:
        ordering = []
        constraints = [
            models.UniqueConstraint(
                fields=['group', 'user'],
                name='unique_group_membership'
            )
        ]

    def __str__(self):
        return f"{self.user.username} in {self.group.name}"


class GroupInviteCode(BaseModel):
    """
    A shareable code that allows users to join a group.
    """
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='invite_codes',
    )
    code = models.CharField(max_length=8, unique=True, default=generate_invite_code)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='created_invite_codes',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.group.name} - {self.code}"


class GroupJoinRequest(BaseModel):
    """
    A request from a user to join a private group.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        DENIED = 'denied', 'Denied'

    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='join_requests',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='group_join_requests',
    )
    message = models.TextField(max_length=500, blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['group', 'user'],
                condition=Q(status='pending'),
                name='unique_pending_group_join_request',
            )
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.group.name} ({self.status})"
