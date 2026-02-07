from django.db import models
from django.db.models import Q
from common.models import BaseModel


class Reaction(BaseModel):
    """
    Represents a reaction to a post, quick workout, or comment.
    """

    class ReactionType(models.TextChoices):
        LIKE = 'like', 'Like'
        LOVE = 'love', 'Love'
        FIRE = 'fire', 'Fire'
        LAUGH = 'laugh', 'Laugh'

    post = models.ForeignKey(
        'social.Post',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='reactions',
    )
    quick_workout = models.ForeignKey(
        'social.QuickWorkout',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='reactions',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    comment = models.ForeignKey(
        'social.Comment',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='reactions',
    )

    type = models.CharField(max_length=10, choices=ReactionType.choices)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['post', 'created_at'], name='idx_reaction_post'),
            models.Index(fields=['quick_workout', 'created_at'], name='idx_reaction_quick_workout'),
            models.Index(fields=['comment', 'created_at'], name='idx_reaction_comment'),
            models.Index(fields=['user', 'created_at'], name='idx_reaction_user'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(post__isnull=False, quick_workout__isnull=True, comment__isnull=True)
                    | Q(post__isnull=True, quick_workout__isnull=False, comment__isnull=True)
                    | Q(post__isnull=True, quick_workout__isnull=True, comment__isnull=False)
                ),
                name='reaction_on_exactly_one_target',
            ),
            models.UniqueConstraint(
                fields=['post', 'user'],
                condition=Q(post__isnull=False),
                name='unique_reaction_per_user_per_post',
            ),
            models.UniqueConstraint(
                fields=['quick_workout', 'user'],
                condition=Q(quick_workout__isnull=False),
                name='unique_reaction_per_user_per_quick_workout',
            ),
            models.UniqueConstraint(
                fields=['comment', 'user'],
                condition=Q(comment__isnull=False),
                name='unique_reaction_per_user_per_comment',
            ),
        ]

    def __str__(self):
        return f"{self.user.username} reacted ({self.type})"
