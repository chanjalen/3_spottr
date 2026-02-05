from django.contrib import admin
from .models import Group, GroupMember


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by', 'group_streak', 'created_at']
    search_fields = ['name', 'created_by__username']


@admin.register(GroupMember)
class GroupMemberAdmin(admin.ModelAdmin):
    list_display = ['user', 'group', 'role', 'joined_at']
    search_fields = ['user__username', 'group__name']
    list_filter = ['role']
