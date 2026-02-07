from django.db import models
from django.db.models import F
from common.models import BaseModel


class Block(BaseModel):
    """
    Represents a block relationship between two users.
    """
    blocker = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='blocking',
    )
    blocked = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='blocked_by',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['blocker', 'blocked'],
                name='unique_block',
            ),
            models.CheckConstraint(
                condition=~models.Q(blocker=F('blocked')),
                name='no_self_block',
            ),
        ]

    def __str__(self):
        return f"{self.blocker.username} blocked {self.blocked.username}"
