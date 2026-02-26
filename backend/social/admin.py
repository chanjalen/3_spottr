from django.contrib import admin
from .models import (
    Post, QuickWorkout, Comment, Reaction,
    Follow, Block, LeaderboardEntry,
)


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['user', 'visibility', 'created_at']
    search_fields = ['user__username', 'description']
    list_filter = ['visibility', 'created_at']


@admin.register(QuickWorkout)
class QuickWorkoutAdmin(admin.ModelAdmin):
    list_display = ['user', 'type', 'created_at']
    search_fields = ['user__username']
    list_filter = ['type']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['user', 'post', 'quick_workout', 'created_at']
    search_fields = ['user__username', 'description']


@admin.register(Reaction)
class ReactionAdmin(admin.ModelAdmin):
    list_display = ['user', 'post', 'quick_workout', 'comment', 'type', 'created_at']
    search_fields = ['user__username']
    list_filter = ['type']


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ['follower', 'following', 'created_at']
    search_fields = ['follower__username', 'following__username']


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ['blocker', 'blocked', 'created_at']
    search_fields = ['blocker__username', 'blocked__username']


@admin.register(LeaderboardEntry)
class LeaderboardEntryAdmin(admin.ModelAdmin):
    list_display = ['user', 'gym', 'rank']
    search_fields = ['user__username']
