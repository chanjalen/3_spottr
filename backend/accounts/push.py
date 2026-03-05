"""
Expo push notification helpers.
send_push() fires-and-forgets a single notification to an Expo push token.
"""
import logging
import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


def send_push(token: str, title: str, body: str, data: dict | None = None) -> None:
    """Send a push notification via Expo's push API. Silently ignores failures."""
    if not token or not token.startswith('ExponentPushToken['):
        return
    payload = {
        'to': token,
        'title': title,
        'body': body,
        'sound': 'default',
        'data': data or {},
    }
    try:
        requests.post(EXPO_PUSH_URL, json=payload, timeout=5)
    except Exception as e:
        logger.warning('send_push failed: %s', e)


def send_push_to_user(user, title: str, body: str, data: dict | None = None) -> None:
    """Send a push notification to a user if they have a token and push enabled."""
    if not getattr(user, 'push_notifications', True):
        return
    token = getattr(user, 'expo_push_token', '')
    if token:
        send_push(token, title, body, data)
