import re
import uuid

from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth import get_user_model

User = get_user_model()


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Custom adapter for Google OAuth sign-in.

    Our User model requires username, email, and display_name at minimum.
    phone_number and birthday are now nullable so OAuth users can skip them.
    """

    def save_user(self, request, sociallogin, form=None):
        user = super().save_user(request, sociallogin, form)

        # Ensure display_name is set (fall back to username if allauth left it blank)
        if not user.display_name:
            user.display_name = user.username
            user.save(update_fields=["display_name"])

        return user

    def populate_user(self, request, sociallogin, data):
        """
        Fill in User fields from Google account data.
        Called before save_user — sets username, email, display_name.
        """
        user = super().populate_user(request, sociallogin, data)

        # Build a clean username from the Google email address
        email = data.get("email", "")
        base_username = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0])[:25]
        if not base_username:
            base_username = "user"

        # Make sure the username is unique by appending a short suffix if needed
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{suffix}"
            suffix += 1

        user.username = username

        # Set display_name from Google full name or fall back to username
        if not user.display_name:
            full_name = data.get("name", "").strip()
            user.display_name = full_name[:50] if full_name else username

        # Leave phone_number=None and birthday=None — they are nullable now
        user.phone_number = None
        user.birthday = None

        return user

    def is_auto_signup_allowed(self, request, sociallogin):
        # Allow automatic account creation for Google sign-ins
        return True
