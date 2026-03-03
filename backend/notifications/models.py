from django.db import models
from django.db.models import Q
from common.models import BaseModel


class Notification(BaseModel):
    """
    Represents a notification for a user.
    Uses a polymorphic pattern: type + target + context
    to resolve notification content at render time.
    """

    class Type(models.TextChoices):
        LIKE_POST = 'like_post', 'Like Post'
        LIKE_CHECKIN = 'like_checkin', 'Like Checkin'
        LIKE_COMMENT = 'like_comment', 'Like Comment'
        COMMENT = 'comment', 'Comment'
        FOLLOW = 'follow', 'Follow'
        PR = 'pr', 'Personal Record'
        MENTION = 'mention', 'Mention'
        WORKOUT_INVITE = 'workout_invite', 'Workout Invite'
        JOIN_REQUEST = 'join_request', 'Join Request'

    class TargetType(models.TextChoices):
        POST = 'post', 'Post'
        COMMENT = 'comment', 'Comment'
        WORKOUT = 'workout', 'Workout'
        QUICK_WORKOUT = 'quick_workout', 'Quick Workout'
        PERSONAL_RECORD = 'personal_record', 'Personal Record'
        GROUP = 'group', 'Group'
        USER = 'user', 'User'
        WORKOUT_INVITE = 'workout_invite', 'Workout Invite'

    recipient = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    triggered_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='triggered_notifications',
    )

    type = models.CharField(max_length=20, choices=Type.choices)
    target_type = models.CharField(max_length=20, choices=TargetType.choices)
    target_id = models.CharField(max_length=36)
    context_type = models.CharField(max_length=20, blank=True)
    context_id = models.CharField(max_length=36, blank=True)

    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', '-created_at'], name='idx_notif_recipient'),
            models.Index(fields=['recipient', 'read_at'], name='idx_notif_unread'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(context_type='', context_id='')
                    | (~Q(context_type='') & ~Q(context_id=''))
                ),
                name='notif_context_all_or_nothing',
            )
        ]

    def __str__(self):
        return f"{self.type} for {self.recipient.username}"
