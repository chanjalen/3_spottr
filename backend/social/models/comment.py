from django.db import models
from django.db.models import Q
from common.models import BaseModel


class Comment(BaseModel):
    """
    Represents a comment on a post, quick workout, or another comment (reply).
    Either post, quick_workout, or parent_comment must be set.
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
    parent_comment = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='replies',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='comments',
    )

    description = models.TextField(blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['post', 'created_at'], name='idx_comment_post'),
            models.Index(fields=['quick_workout', 'created_at'], name='idx_comment_quick_workout'),
            models.Index(fields=['user', 'created_at'], name='idx_comment_user'),
            models.Index(fields=['parent_comment', 'created_at'], name='idx_comment_parent'),
        ]

    def __str__(self):
        if self.parent_comment:
            return f"Reply by {self.user.username}"
        return f"Comment by {self.user.username}"

    @property
    def reply_count(self):
        return self.replies.count()
