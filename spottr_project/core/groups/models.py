from django.db import models
from common.models import BaseModel


class Group(BaseModel):
    """
    Represents a group that users can join.
    """
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='created_groups'
    )

    name = models.CharField(max_length=100)
    avatar = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    group_streak = models.IntegerField(default=0)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class GroupMember(BaseModel):
    """
    Represents a user's membership in a group.
    """
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='members'
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='group_memberships'
    )

    role = models.CharField(max_length=20, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-joined_at']
        constraints = [
            models.UniqueConstraint(
                fields=['group', 'user'],
                name='unique_group_membership'
            )
        ]

    def __str__(self):
        return f"{self.user.username} in {self.group.name}"
