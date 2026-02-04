from django.contrib import admin
from .models import Message


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'receiver', 'group', 'type', 'is_read', 'created_at']
    search_fields = ['sender__username', 'receiver__username', 'content']
    list_filter = ['type', 'is_read']
