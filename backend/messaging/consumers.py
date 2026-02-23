import json
import logging
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


def _clean_id(value):
    """Strip hyphens from UUID strings so they're safe as channel group names."""
    return str(value).replace('-', '')


class MessagingConsumer(AsyncWebsocketConsumer):

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def connect(self):
        # Extract token from query string: ws://host/ws/messaging/?token=abc123
        params = parse_qs(self.scope.get('query_string', b'').decode())
        token_list = params.get('token', [])

        if not token_list:
            await self.close(code=4001)
            return

        self.user = await self._get_user_from_token(token_list[0])
        if self.user is None:
            await self.close(code=4001)
            return

        # Personal DM channel — every user has one, named after their ID.
        self.dm_group = f"dm_{_clean_id(self.user.id)}"

        # Group chat channels — one per group the user belongs to.
        self.group_channels = await self._get_group_channels()

        await self.channel_layer.group_add(self.dm_group, self.channel_name)
        for gc in self.group_channels:
            await self.channel_layer.group_add(gc, self.channel_name)

        await self.accept()
        logger.info("WS connected: %s", self.user.username)

    async def disconnect(self, close_code):
        if not hasattr(self, 'user') or self.user is None:
            return

        await self.channel_layer.group_discard(self.dm_group, self.channel_name)
        for gc in getattr(self, 'group_channels', []):
            await self.channel_layer.group_discard(gc, self.channel_name)

        logger.info("WS disconnected: %s (code=%s)", self.user.username, close_code)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if data.get('type') != 'send_message':
            return  # silently ignore ping and unknown types

        content = (data.get('content') or '').strip()
        if not content:
            return

        recipient_id = data.get('recipient_id')
        group_id     = data.get('group_id')

        try:
            if recipient_id:
                await self._ws_send_dm(recipient_id, content)
            elif group_id:
                await self._ws_send_group(group_id, content)
        except Exception as exc:
            logger.warning("WS send_message failed for %s: %s", self.user.username, exc)
            await self.send(text_data=json.dumps({
                'type': 'error',
                'code': type(exc).__name__,
                'detail': str(exc),
            }))

    # ── Channel layer event handlers ─────────────────────────────────────────
    # These are called by channel_layer.group_send() in services.py.
    # The method name maps to the "type" field (dots replaced with underscores).

    async def new_message(self, event):
        """Forward a new message to this WebSocket client."""
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': event['message'],
        }))

    async def unread_update(self, event):
        """Forward updated unread counts to this WebSocket client."""
        await self.send(text_data=json.dumps({
            'type': 'unread_update',
            'counts': event['counts'],
        }))

    # ── DB helpers (must be async-safe) ──────────────────────────────────────

    @database_sync_to_async
    def _ws_send_dm(self, recipient_id, content):
        from messaging.services import send_dm
        return send_dm(self.user, recipient_id, content)

    @database_sync_to_async
    def _ws_send_group(self, group_id, content):
        from messaging.services import send_group_message
        return send_group_message(self.user, group_id, content)

    @database_sync_to_async
    def _get_user_from_token(self, token_key):
        from rest_framework.authtoken.models import Token
        try:
            return Token.objects.select_related('user').get(key=token_key).user
        except Token.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_group_channels(self):
        from groups.models import GroupMember
        group_ids = GroupMember.objects.filter(
            user=self.user
        ).values_list('group_id', flat=True)
        return [f"group_{_clean_id(gid)}" for gid in group_ids]
