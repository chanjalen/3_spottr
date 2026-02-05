from django.db import models
from common.models import BaseModel
from .post import Post


class Reaction(BaseModel):
    """
    Represents a reaction to a post.
    """
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='reactions'
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='reactions'
    )

    type = models.CharField(max_length=50)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['post', 'user'],
                name='unique_reaction_per_user_per_post'
            )
        ]

    def __str__(self):
        return f"{self.user.username} reacted to {self.post.id}"
