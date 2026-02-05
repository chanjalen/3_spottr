from django.contrib import admin
from .models import Friendship, PersonalRecord, LeaderboardEntry


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ['user', 'friend', 'status', 'created_at']
    search_fields = ['user__username', 'friend__username']
    list_filter = ['status']


@admin.register(PersonalRecord)
class PersonalRecordAdmin(admin.ModelAdmin):
    list_display = ['user', 'exercise_name', 'value', 'unit', 'achieved_date']
    search_fields = ['user__username', 'exercise_name']
    list_filter = ['exercise_name', 'achieved_date']


@admin.register(LeaderboardEntry)
class LeaderboardEntryAdmin(admin.ModelAdmin):
    list_display = ['user', 'period', 'rank', 'score', 'workout_count']
    search_fields = ['user__username']
    list_filter = ['period']
