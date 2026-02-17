from django.conf import settings
from django.core.files.storage import default_storage

from .models import MediaAsset, MediaLink


def create_media_asset(user, file, storage_key, kind='image', already_saved=False):
    """
    Create a MediaAsset row and optionally save the file to S3.

    Args:
        already_saved: If True, skip uploading (file was already saved by an
                       ImageField or prior default_storage.save() call).
    """
    if not already_saved:
        # Ensure file cursor is at the start before uploading
        if hasattr(file, 'seek'):
            file.seek(0)
        default_storage.save(storage_key, file)

    asset = MediaAsset.objects.create(
        user=user,
        kind=kind,
        storage_key=storage_key,
        mime_type=getattr(file, 'content_type', 'image/jpeg'),
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
