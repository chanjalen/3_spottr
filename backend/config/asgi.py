import os
from dotenv import load_dotenv
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

load_dotenv()

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

# Must call get_asgi_application() before importing consumers so Django is set up first.
django_asgi_app = get_asgi_application()

from messaging.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        URLRouter(websocket_urlpatterns)
    ),
})
