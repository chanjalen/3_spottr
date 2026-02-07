from django.contrib import admin
from .models import MediaAsset, MediaLink


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'kind', 'mime_type', 'status', 'created_at']
    search_fields = ['user__username', 'storage_key']
    list_filter = ['kind', 'status']


@admin.register(MediaLink)
class MediaLinkAdmin(admin.ModelAdmin):
    list_display = ['asset', 'destination_type', 'destination_id', 'type', 'position']
    search_fields = ['destination_id']
    list_filter = ['destination_type', 'type']
