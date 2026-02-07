from django.db import models
from django.db.models import Q
from common.models import BaseModel


class Comment(BaseModel):
    """
    Represents a comment on a post or quick workout.
    Either post or quick_workout must be set, but not both.
    """
    post = models.ForeignKey(
        'social.Post',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='comments',
    )
    quick_workout = models.ForeignKey(
        'social.QuickWorkout',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='comments',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='comments',
    )

    description = models.TextField(blank= True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['post', 'created_at'], name='idx_comment_post'),
            models.Index(fields=['quick_workout', 'created_at'], name='idx_comment_quick_workout'),
            models.Index(fields=['user', 'created_at'], name='idx_comment_user'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(post__isnull=False, quick_workout__isnull=True)
                    | Q(post__isnull=True, quick_workout__isnull=False)
                ),
                name='comment_on_post_or_quick_workout',
            )
        ]

    def __str__(self):
        return f"Comment by {self.user.username}"
