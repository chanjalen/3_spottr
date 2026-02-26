from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'type', 'triggered_by', 'target_type', 'read_at', 'created_at']
    search_fields = ['recipient__username']
    list_filter = ['type', 'target_type']
