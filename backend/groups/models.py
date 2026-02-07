from django.db import models
from django.db.models import Case, When, IntegerField
from common.models import BaseModel


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
    description = models.TextField(max_length= 500, blank=True)
    group_streak = models.IntegerField(default=0)
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
