from django.contrib import admin
from .models import Gym, BusyLevel, WorkoutInvite, JoinRequest


@admin.register(Gym)
class GymAdmin(admin.ModelAdmin):
    list_display = ['name', 'address', 'phone_number', 'rating', 'rating_count', 'google_place_id']
    search_fields = ['name', 'address']


@admin.register(BusyLevel)
class BusyLevelAdmin(admin.ModelAdmin):
    list_display = ['gym', 'user', 'timestamp', 'survey_response']
    search_fields = ['gym__name', 'user__username']


@admin.register(WorkoutInvite)
class WorkoutInviteAdmin(admin.ModelAdmin):
    list_display = ['user', 'gym', 'workout_type', 'type', 'scheduled_time', 'spots_available', 'invited_user']
    search_fields = ['user__username', 'gym__name']
    list_filter = ['workout_type', 'type']


@admin.register(JoinRequest)
class JoinRequestAdmin(admin.ModelAdmin):
    list_display = ['user', 'workout_invite', 'status', 'joined_at']
    search_fields = ['user__username']
    list_filter = ['status']
