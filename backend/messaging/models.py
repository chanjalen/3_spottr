from django.db import models
from django.db.models import Q
from common.models import BaseModel


class Message(BaseModel):
    """
    Represents a direct message between users or in a group.
    Either recipient (DM) or group (group chat) must be set, but not both.
    """
    sender = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sent_messages',
    )
    recipient = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='received_messages',
    )
    group = models.ForeignKey(
        'groups.Group',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='messages',
    )
    post = models.ForeignKey(
        'social.Post',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shared_messages',
    )
    quick_workout = models.ForeignKey(
        'social.QuickWorkout',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shared_messages',
    )
    join_request = models.ForeignKey(
        'groups.GroupJoinRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='system_messages',
    )

    content = models.TextField()
    is_request = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Composite cursor indexes — include id for stable tie-breaking on equal timestamps
            models.Index(fields=['group', '-created_at', '-id'], name='idx_message_group_cursor'),
            models.Index(fields=['sender', 'recipient', '-created_at', '-id'], name='idx_message_dm_sent'),
            models.Index(fields=['recipient', 'sender', '-created_at', '-id'], name='idx_message_dm_recv'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(recipient__isnull=False, group__isnull=True)
                    | Q(recipient__isnull=True, group__isnull=False)
                ),
                name='message_recipient_or_group',
            )
        ]

    def __str__(self):
        sender_name = self.sender.username if self.sender else 'system'
        if self.recipient:
            return f"{sender_name} -> {self.recipient.username}"
        return f"{sender_name} -> {self.group.name}"


class MessageRead(BaseModel):
    """
    Tracks per-user read receipts for both DMs and group messages.
    """
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='read_receipts',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='read_receipts',
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-read_at']
        indexes = [
            models.Index(fields=['user', '-read_at'], name='idx_read_receipt_user'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'user'],
                name='unique_read_receipt',
            )
        ]

    def __str__(self):
        return f"{self.user.username} read message {self.message.id}"
