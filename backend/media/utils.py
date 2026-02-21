from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage

from .models import MediaAsset, MediaLink

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
ALLOWED_VIDEO_TYPES = {'video/mp4', 'video/quicktime', 'video/webm'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def create_media_asset(user, file, storage_key, kind='image', already_saved=False):
    """
    Create a MediaAsset row and optionally save the file to S3.

    Args:
        already_saved: If True, skip uploading (file was already saved by an
                       ImageField or prior default_storage.save() call).
    Raises:
        ValidationError: If the file type or size is not allowed.
    """
    content_type = getattr(file, 'content_type', '')

    # Validate MIME type and size only for files not yet processed by Django's ImageField.
    # already_saved=True means the ImageField/Pillow already validated the content.
    if not already_saved:
        if kind == 'image' and content_type not in ALLOWED_IMAGE_TYPES:
            raise ValidationError(f"Unsupported image type: {content_type}. Allowed: JPEG, PNG, GIF, WebP.")
        if kind == 'video' and content_type not in ALLOWED_VIDEO_TYPES:
            raise ValidationError(f"Unsupported video type: {content_type}. Allowed: MP4, MOV, WebM.")
        if hasattr(file, 'size') and file.size > MAX_FILE_SIZE:
            raise ValidationError(f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB.")

    if not already_saved:
        # Ensure file cursor is at the start before uploading
        if hasattr(file, 'seek'):
            file.seek(0)
        default_storage.save(storage_key, file)

    asset = MediaAsset.objects.create(
        user=user,
        kind=kind,
        storage_key=storage_key,
        mime_type=content_type or 'image/jpeg',
        byte_size=file.size,
        status=MediaAsset.Status.READY,
    )
    return asset


def get_media_url(destination_type, destination_id, link_type='inline'):
    """Look up a MediaLink and return the public URL, or None."""
    link = (
        MediaLink.objects
        .filter(
            destination_type=destination_type,
            destination_id=str(destination_id),
            type=link_type,
        )
        .select_related('asset')
        .first()
    )
    if link:
        return link.asset.url
    return None


def build_media_url(storage_key):
    """Build a public URL for a storage key using MEDIA_URL."""
    if not storage_key:
        return None
    return f"{settings.MEDIA_URL}{storage_key}"
