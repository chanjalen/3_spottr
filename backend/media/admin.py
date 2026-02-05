from django.contrib import admin
from .models import MediaAsset, MediaLink


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ['id', 'owner_user', 'kind', 'mime_type', 'status', 'created_at']
    search_fields = ['owner_user__username', 'storage_key']
    list_filter = ['kind', 'status', 'mime_type']


@admin.register(MediaLink)
class MediaLinkAdmin(admin.ModelAdmin):
    list_display = ['asset', 'target_type', 'target_id', 'role', 'position']
    search_fields = ['target_id']
    list_filter = ['target_type', 'role']
