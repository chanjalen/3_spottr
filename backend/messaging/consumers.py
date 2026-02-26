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

        # Org announcement channels — one per org the user belongs to.
        self.org_channels = await self._get_org_channels()

        await self.channel_layer.group_add(self.dm_group, self.channel_name)
        for gc in self.group_channels:
            await self.channel_layer.group_add(gc, self.channel_name)
        for oc in self.org_channels:
            await self.channel_layer.group_add(oc, self.channel_name)

        await self.accept()
        logger.info("WS connected: %s", self.user.username)

    async def disconnect(self, close_code):
        if not hasattr(self, 'user') or self.user is None:
            return

        await self.channel_layer.group_discard(self.dm_group, self.channel_name)
        for gc in getattr(self, 'group_channels', []):
            await self.channel_layer.group_discard(gc, self.channel_name)
        for oc in getattr(self, 'org_channels', []):
            await self.channel_layer.group_discard(oc, self.channel_name)

        logger.info("WS disconnected: %s (code=%s)", self.user.username, close_code)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = data.get('type')

        # subscribe_group: client entered a group chat after connecting — join the channel now
        if msg_type == 'subscribe_group':
            group_id = data.get('group_id')
            if group_id and await self._is_group_member(group_id):
                channel = f"group_{_clean_id(group_id)}"
                if channel not in getattr(self, 'group_channels', []):
                    await self.channel_layer.group_add(channel, self.channel_name)
                    self.group_channels.append(channel)
            return

        # subscribe_org: client entered an org announcements screen after connecting
        if msg_type == 'subscribe_org':
            org_id = data.get('org_id')
            if org_id and await self._is_org_member(org_id):
                channel = f"org_{_clean_id(org_id)}"
                if channel not in getattr(self, 'org_channels', []):
                    await self.channel_layer.group_add(channel, self.channel_name)
                    self.org_channels.append(channel)
            return

        if msg_type != 'send_message':
            return  # silently ignore ping and unknown types

        content = (data.get('content') or '').strip()
        if not content:
            return

        recipient_id = data.get('recipient_id')
        group_id     = data.get('group_id')

        # client_msg_id: opaque string the client uses to reconcile optimistic messages.
        # Sanitised to a plain string, capped at 64 chars to prevent injection or overflow.
        raw_cmid = data.get('client_msg_id')
        client_msg_id = str(raw_cmid)[:64] if raw_cmid is not None else None

        try:
            if recipient_id:
                payload, sender_group, recipient_group, recipient_unread = \
                    await self._ws_send_dm(recipient_id, content, client_msg_id)
                msg_event = {'type': 'new_message', 'message': payload}
                await self.channel_layer.group_send(sender_group, msg_event)
                await self.channel_layer.group_send(recipient_group, msg_event)
                await self.channel_layer.group_send(
                    recipient_group,
                    {'type': 'unread_update', 'counts': recipient_unread},
                )
            elif group_id:
                payload, group_channel, member_dm_groups = \
                    await self._ws_send_group(group_id, content, client_msg_id)
                await self.channel_layer.group_send(
                    group_channel,
                    {'type': 'new_message', 'message': payload},
                )
                for dm_group, counts in member_dm_groups.items():
                    await self.channel_layer.group_send(
                        dm_group,
                        {'type': 'unread_update', 'counts': counts},
                    )
        except Exception as exc:
            logger.warning("WS send_message failed for %s: %s", self.user.username, exc)
            err_payload: dict = {
                'type': 'error',
                'code': type(exc).__name__,
                'detail': str(exc),
            }
            if client_msg_id:
                err_payload['client_msg_id'] = client_msg_id
            await self.send(text_data=json.dumps(err_payload))

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

    async def new_announcement(self, event):
        """Forward a new org announcement to this WebSocket client."""
        await self.send(text_data=json.dumps({
            'type': 'new_announcement',
            'announcement': event['announcement'],
        }))

    # ── DB helpers (must be async-safe) ──────────────────────────────────────

    @database_sync_to_async
    def _ws_send_dm(self, recipient_id, content, client_msg_id=None):
        from messaging.services import ws_send_dm
        return ws_send_dm(self.user, recipient_id, content, client_msg_id=client_msg_id)

    @database_sync_to_async
    def _ws_send_group(self, group_id, content, client_msg_id=None):
        from messaging.services import ws_send_group_message
        return ws_send_group_message(self.user, group_id, content, client_msg_id=client_msg_id)

    @database_sync_to_async
    def _get_user_from_token(self, token_key):
        from rest_framework.authtoken.models import Token
        try:
            return Token.objects.select_related('user').get(key=token_key).user
        except Token.DoesNotExist:
            return None

    @database_sync_to_async
    def _is_group_member(self, group_id):
        from groups.models import GroupMember
        return GroupMember.objects.filter(group_id=group_id, user=self.user).exists()

    @database_sync_to_async
    def _get_group_channels(self):
        from groups.models import GroupMember
        group_ids = GroupMember.objects.filter(
            user=self.user
        ).values_list('group_id', flat=True)
        return [f"group_{_clean_id(gid)}" for gid in group_ids]

    @database_sync_to_async
    def _is_org_member(self, org_id):
        from organizations.models import OrgMember
        return OrgMember.objects.filter(org_id=org_id, user=self.user).exists()

    @database_sync_to_async
    def _get_org_channels(self):
        from organizations.models import OrgMember
        org_ids = OrgMember.objects.filter(
            user=self.user
        ).values_list('org_id', flat=True)
        return [f"org_{_clean_id(oid)}" for oid in org_ids]
