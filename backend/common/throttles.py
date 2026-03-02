"""
Central throttle class registry.

All throttle classes live here so scopes are defined in one place.
Import from here in view modules rather than defining inline.
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthRateThrottle(AnonRateThrottle):
    """10 attempts/minute per IP — brute-force guard on login/signup."""
    scope = 'auth'


class ResendVerificationThrottle(UserRateThrottle):
    """3 resend requests/hour per user — prevents email-sending abuse."""
    scope = 'resend_verification'


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

class MessageRateThrottle(UserRateThrottle):
    """30 messages/minute per user — prevents DM/group message spam."""
    scope = 'message'


class ZapRateThrottle(UserRateThrottle):
    """5 zaps/minute per user — zaps are a special nudge action."""
    scope = 'zap'


class ReactionRateThrottle(UserRateThrottle):
    """60 reactions/minute per user — prevents reaction flooding."""
    scope = 'reaction'


# ---------------------------------------------------------------------------
# Social
# ---------------------------------------------------------------------------

class SocialWriteRateThrottle(UserRateThrottle):
    """20 posts or check-ins/minute per user — prevents content spam."""
    scope = 'social_write'


class FollowRateThrottle(UserRateThrottle):
    """60 follow/unfollow actions/minute per user."""
    scope = 'follow'


# ---------------------------------------------------------------------------
# Search / enumeration
# ---------------------------------------------------------------------------

class SearchRateThrottle(AnonRateThrottle):
    """30 searches/minute — limits user enumeration via search or username check."""
    scope = 'search'


# ---------------------------------------------------------------------------
# Creation (groups, orgs)
# ---------------------------------------------------------------------------

class CreateRateThrottle(UserRateThrottle):
    """5 group or org creations/hour — prevents entity spam."""
    scope = 'create'


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------

class UploadRateThrottle(UserRateThrottle):
    """20 file uploads/hour per user — uploads are expensive operations."""
    scope = 'upload'
