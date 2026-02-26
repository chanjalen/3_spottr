import os
import uuid

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from media.utils import create_media_asset


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_media(request):
    """
    Upload a media file (image or video).
    Returns asset_id which can then be passed to send_dm, send_group_message,
    create_announcement, etc.

    Request: multipart/form-data
      file   — the file to upload
      kind   — 'image' or 'video' (optional, defaults to 'image')

    Response: {asset_id, url, kind, status}
    """
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    kind = request.data.get('kind', 'image')
    if kind not in ('image', 'video'):
        return Response({'error': "kind must be 'image' or 'video'."}, status=status.HTTP_400_BAD_REQUEST)

    ext = os.path.splitext(file.name)[1].lower() or ('.jpg' if kind == 'image' else '.mp4')
    storage_key = f"uploads/{uuid.uuid4()}{ext}"

    try:
        asset = create_media_asset(request.user, file, storage_key, kind=kind)
    except ValidationError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'asset_id': str(asset.id),
        'url': asset.url,
        'kind': asset.kind,
        'status': asset.status,
    }, status=status.HTTP_201_CREATED)
