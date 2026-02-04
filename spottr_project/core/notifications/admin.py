from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['user', 'type', 'from_user', 'is_read', 'created_at']
    search_fields = ['user__username', 'content']
    list_filter = ['type', 'is_read']
