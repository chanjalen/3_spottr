from django.contrib import admin
from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['username', 'email', 'display_name', 'member_since']
    search_fields = ['username', 'email', 'display_name']
    list_filter = ['member_since', 'status']
