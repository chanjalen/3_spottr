from django.contrib import admin
from .models import Message, MessageRead


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'recipient', 'group', 'created_at']
    search_fields = ['sender__username', 'recipient__username', 'content']


@admin.register(MessageRead)
class MessageReadAdmin(admin.ModelAdmin):
    list_display = ['message', 'user', 'read_at']
    search_fields = ['user__username']
