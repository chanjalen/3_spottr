from django.db import models
from common.models import BaseModel


class Notification(BaseModel):
    """
    Represents a notification for a user.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    from_user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sent_notifications'
    )

    type = models.CharField(max_length=50)
    related_id = models.CharField(max_length=36, blank=True)
    content = models.TextField()
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} for {self.user.username}"
