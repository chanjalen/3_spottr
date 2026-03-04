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

    content = models.TextField(blank=True, default='')
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
            models.Index(fields=['user', 'message'], name='idx_messageread_user_message'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'user'],
                name='unique_read_receipt',
            )
        ]

    def __str__(self):
        return f"{self.user.username} read message {self.message.id}"


class InboxEntry(BaseModel):
    """
    Denormalized inbox row per (user, conversation).
    Maintained incrementally on every send/read — never recomputed.
    Read: SELECT * WHERE user_id=X ORDER BY latest_message_at DESC LIMIT 50
    """
    CONV_DM = 'dm'
    CONV_GROUP = 'group'
    CONV_CHOICES = [(CONV_DM, 'DM'), (CONV_GROUP, 'Group')]

    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE,
                             related_name='inbox_entries')
    conversation_type = models.CharField(max_length=5, choices=CONV_CHOICES)
    partner = models.ForeignKey('accounts.User', on_delete=models.CASCADE,
                                null=True, blank=True, related_name='+')
    group = models.ForeignKey('groups.Group', on_delete=models.CASCADE,
                              null=True, blank=True, related_name='inbox_entries')
    latest_message = models.ForeignKey('messaging.Message', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='+')
    latest_message_at = models.DateTimeField(null=True, blank=True, db_index=False)
    unread_count = models.PositiveIntegerField(default=0)

    # Reaction preview — set when a reaction is the most recent event in the conversation.
    # latest_reaction_actor: username of who reacted (for display)
    # latest_reaction_message_sender_id: UUID of the message's sender (so each client can
    #   compute "your message" vs "a message" from their own perspective)
    # latest_reaction_at: when the reaction happened (compared against latest_message_at
    #   to decide which preview wins)
    latest_reaction_actor = models.CharField(max_length=30, blank=True, default='')
    latest_reaction_message_sender_id = models.CharField(max_length=36, blank=True, default='')
    latest_reaction_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', '-latest_message_at'], name='idx_inbox_user_time'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'partner'],
                condition=Q(partner__isnull=False),
                name='unique_inbox_dm',
            ),
            models.UniqueConstraint(
                fields=['user', 'group'],
                condition=Q(group__isnull=False),
                name='unique_inbox_group',
            ),
        ]


class MessageReaction(BaseModel):
    """
    An emoji reaction from a user on a message (DM or group chat).
    A user can react with multiple different emojis on the same message,
    but cannot use the same emoji twice on the same message.
    """
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='message_reactions',
    )
    emoji = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'user', 'emoji'],
                name='unique_message_reaction',
            )
        ]

    def __str__(self):
        return f"{self.user.username} reacted {self.emoji} to message {self.message_id}"
