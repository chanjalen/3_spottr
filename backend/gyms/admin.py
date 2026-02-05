from django.contrib import admin
from .models import Gym, GymActivity, WorkoutInvite, InviteParticipant


@admin.register(Gym)
class GymAdmin(admin.ModelAdmin):
    list_display = ['name', 'address', 'current_activity', 'max_capacity']
    search_fields = ['name', 'address']


@admin.register(GymActivity)
class GymActivityAdmin(admin.ModelAdmin):
    list_display = ['gym', 'timestamp', 'activity_count', 'busy_level']
    search_fields = ['gym__name']
    list_filter = ['busy_level']


@admin.register(WorkoutInvite)
class WorkoutInviteAdmin(admin.ModelAdmin):
    list_display = ['user', 'gym', 'workout_type', 'scheduled_time', 'status']
    search_fields = ['user__username', 'gym__name']
    list_filter = ['status', 'workout_type']


@admin.register(InviteParticipant)
class InviteParticipantAdmin(admin.ModelAdmin):
    list_display = ['user', 'invite', 'status', 'joined_at']
    search_fields = ['user__username']
    list_filter = ['status']
