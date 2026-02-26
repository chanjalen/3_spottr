from rest_framework import serializers
from .models import MediaAsset, MediaLink


class MediaAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAsset
        fields = [
            'id', 'owner', 'kind', 'storage_key', 'thumbnail_key', 'mime_type',
            'byte_size', 'width', 'height', 'duration_ms', 'status',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MediaLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaLink
        fields = [
            'id', 'asset', 'target_type', 'target_id', 'role',
            'position', 'caption', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
