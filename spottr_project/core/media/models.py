from django.db import models
from common.models import BaseModel


class MediaAsset(BaseModel):
    """
    Represents an uploaded media file.
    """
    owner_user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='media_assets'
    )

    kind = models.CharField(max_length=50)
    storage_key = models.CharField(max_length=255)
    thumbnail_key = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100)

    byte_size = models.IntegerField()
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)

    status = models.CharField(max_length=50, default='pending')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.kind} - {self.storage_key}"


class MediaLink(BaseModel):
    """
    Links media assets to various entities (posts, workouts, etc.).
    """
    asset = models.ForeignKey(
        MediaAsset,
        on_delete=models.CASCADE,
        related_name='links'
    )

    target_type = models.CharField(max_length=50)
    target_id = models.CharField(max_length=36)

    role = models.CharField(max_length=50)
    position = models.IntegerField(default=0)
    caption = models.TextField(blank=True)

    class Meta:
        ordering = ['position']

    def __str__(self):
        return f"{self.asset.id} -> {self.target_type}:{self.target_id}"
