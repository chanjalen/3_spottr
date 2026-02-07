from django.db import models
from django.db.models import F
from common.models import BaseModel


class Follow(BaseModel):
    """
    Represents a follow relationship between two users.
    """
    follower = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='following',
    )
    following = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='followers',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['follower', 'following'],
                name='unique_follow',
            ),
            models.CheckConstraint(
                condition=~models.Q(follower=F('following')),
                name='no_self_follow',
            ),
        ]

    def __str__(self):
        return f"{self.follower.username} -> {self.following.username}"
