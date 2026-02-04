from django.contrib import admin
from .models import Post, Reaction, Comment


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['user', 'type', 'visibility', 'created_at']
    search_fields = ['user__username', 'content']
    list_filter = ['type', 'visibility', 'created_at']


@admin.register(Reaction)
class ReactionAdmin(admin.ModelAdmin):
    list_display = ['user', 'post', 'type', 'created_at']
    search_fields = ['user__username']
    list_filter = ['type']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['user', 'post', 'created_at']
    search_fields = ['user__username', 'content']
