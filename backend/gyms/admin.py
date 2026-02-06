from django.contrib import admin
from .models import Gym, BusyLevel, WorkoutInvite, JoinRequest


@admin.register(Gym)
class GymAdmin(admin.ModelAdmin):
    list_display = ['name', 'address', 'phone_number']
    search_fields = ['name', 'address']


@admin.register(BusyLevel)
class BusyLevelAdmin(admin.ModelAdmin):
    list_display = ['gym', 'timestamp', 'survey_response']
    search_fields = ['gym__name']


@admin.register(WorkoutInvite)
class WorkoutInviteAdmin(admin.ModelAdmin):
    list_display = ['user', 'gym', 'workout_type', 'scheduled_time']
    search_fields = ['user__username', 'gym__name']
    list_filter = ['workout_type']


@admin.register(JoinRequest)
class JoinRequestAdmin(admin.ModelAdmin):
    list_display = ['user', 'workout_invite', 'status', 'joined_at']
    search_fields = ['user__username']
    list_filter = ['status']
