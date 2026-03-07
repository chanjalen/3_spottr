from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.shortcuts import render
from django.urls import include, path

from social.views import feed_view


urlpatterns = [
    path("", feed_view, name="home"),
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("allauth.urls")),  # Google OAuth callbacks
    path("gyms/", include("gyms.urls")),
    path("social/", include("social.urls")),
    path("workouts/", include("workouts.urls")),
    path("groups/", include("groups.urls")),
    path("api/gyms/", include("gyms.api.urls")),
    path("api/groups/", include("groups.api.urls")),
    path("api/messaging/", include("messaging.api.urls")),
    path("api/social/", include("social.api.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/ai/", include("ai.urls")),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)