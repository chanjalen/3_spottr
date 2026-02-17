from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'display_name', 'is_staff', 'member_since']
    search_fields = ['username', 'email', 'display_name']
    list_filter = ['is_staff', 'is_active', 'status', 'member_since']
    ordering = ['username']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Profile', {'fields': ('email', 'phone_number', 'display_name', 'birthday', 'avatar', 'bio')}),
        ('Fitness', {'fields': ('workout_frequency', 'current_streak', 'longest_streak', 'total_workouts', 'enrolled_gyms')}),
        ('Status', {'fields': ('status',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'phone_number', 'display_name', 'birthday', 'password1', 'password2'),
        }),
    )