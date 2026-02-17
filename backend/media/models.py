from django.db import models
from common.models import BaseModel


class MediaAsset(BaseModel):
    """
    Represents an uploaded media file (image or video).
    """

    class Kind(models.TextChoices):
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'

    class Status(models.TextChoices):
        UPLOADED = 'uploaded', 'Uploaded'
        PROCESSING = 'processing', 'Processing'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='media_assets',
    )

    kind = models.CharField(max_length=10, choices=Kind.choices)
    storage_key = models.CharField(max_length=255)
    thumbnail_key = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100)

    byte_size = models.PositiveIntegerField()
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.UPLOADED,
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='idx_media_asset_user'),
            models.Index(fields=['status'], name='idx_media_asset_status'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['storage_key'],
                name='unique_storage_key',
            )
        ]

    @property
    def url(self):
        from django.conf import settings
        return f"{settings.MEDIA_URL}{self.storage_key}"

    def __str__(self):
        return f"{self.kind} - {self.storage_key}"


class MediaLink(BaseModel):
    """
    Links media assets to various entities via polymorphic destination.
    destinationType + destinationId resolved at the app layer.
    """

    class DestinationType(models.TextChoices):
        POST = 'post', 'Post'
        USER = 'user', 'User'
        GROUP = 'group', 'Group'
        PERSONAL_RECORD = 'personal_record', 'Personal Record'
        MESSAGE = 'message', 'Message'
        QUICK_WORKOUT = 'quick_workout', 'Quick Workout'

    class Type(models.TextChoices):
        AVATAR = 'avatar', 'Avatar'
        COVER = 'cover', 'Cover'
        INLINE = 'inline', 'Inline'

    asset = models.ForeignKey(
        MediaAsset,
        on_delete=models.CASCADE,
        related_name='links',
    )

    destination_type = models.CharField(
        max_length=20,
        choices=DestinationType.choices,
    )
    destination_id = models.CharField(max_length=36)
    type = models.CharField(max_length=10, choices=Type.choices)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']
        indexes = [
            models.Index(fields=['destination_type', 'destination_id'], name='idx_media_link_dest'),
            models.Index(fields=['asset'], name='idx_media_link_asset'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['destination_type', 'destination_id', 'type'],
                condition=models.Q(type__in=['avatar', 'cover']),
                name='unique_avatar_or_cover_per_destination',
            ),
            models.UniqueConstraint(
                fields=['asset', 'destination_type', 'destination_id', 'type'],
                name='unique_media_link',
            ),
        ]

    def __str__(self):
        return f"{self.asset.id} -> {self.destination_type}:{self.destination_id}"
