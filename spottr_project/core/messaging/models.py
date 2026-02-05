from django.db import models
from common.models import BaseModel


class Message(BaseModel):
    """
    Represents a direct message between users or in a group.
    """
    sender = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    recipient = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='received_messages'
    )
    group = models.ForeignKey(
        'groups.Group',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='messages'
    )

    content = models.TextField()
    type = models.CharField(max_length=20, default='text')
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        if self.recipient:
            return f"{self.sender.username} -> {self.recipient.username}"
        return f"{self.sender.username} -> {self.group.name}"
