"""
Tests for MessagingConsumer.reaction_update

Verifies the consumer correctly forwards a channel-layer reaction_update event
to the connected WebSocket client as JSON.

Uses IsolatedAsyncioTestCase (Django 3.1+) so we can await async consumer methods
without needing pytest-asyncio.

Run:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test \
        messaging.tests.test_consumers
"""

import json
from unittest import IsolatedAsyncioTestCase

from messaging.consumers import MessagingConsumer


class ReactionUpdateConsumerTests(IsolatedAsyncioTestCase):
    """reaction_update() must forward the event as a JSON frame over WebSocket."""

    async def _call_reaction_update(self, event):
        """
        Instantiate a bare consumer (no real WS), monkey-patch send, and call
        reaction_update(event). Returns the list of text frames sent.
        """
        consumer = MessagingConsumer()
        sent_frames = []

        async def mock_send(text_data=None, bytes_data=None, close=False):
            if text_data is not None:
                sent_frames.append(text_data)

        consumer.send = mock_send
        await consumer.reaction_update(event)
        return sent_frames

    async def test_sends_exactly_one_frame(self):
        event = {
            'type': 'reaction_update',
            'message_id': 'abc-123',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        self.assertEqual(len(frames), 1)

    async def test_frame_is_valid_json(self):
        event = {
            'type': 'reaction_update',
            'message_id': 'abc-123',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        try:
            json.loads(frames[0])
        except json.JSONDecodeError:
            self.fail("Frame is not valid JSON")

    async def test_frame_type_is_reaction_update(self):
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-999',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertEqual(payload['type'], 'reaction_update')

    async def test_frame_includes_message_id(self):
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-42',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertEqual(payload['message_id'], 'msg-42')

    async def test_frame_includes_reactions(self):
        reactions = [
            {'emoji': '👍', 'count': 3, 'reactor_ids': ['uid1', 'uid2', 'uid3']},
            {'emoji': '🔥', 'count': 1, 'reactor_ids': ['uid4']},
        ]
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-7',
            'reactions': reactions,
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertEqual(payload['reactions'], reactions)

    async def test_frame_with_empty_reactions(self):
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-empty',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertEqual(payload['reactions'], [])

    async def test_reactor_ids_are_preserved_in_frame(self):
        """reactor_ids must pass through exactly — the client uses them to compute user_reacted."""
        ids = ['user-a', 'user-b']
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-1',
            'reactions': [{'emoji': '💪', 'count': 2, 'reactor_ids': ids}],
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertEqual(payload['reactions'][0]['reactor_ids'], ids)

    async def test_no_extra_keys_in_frame(self):
        """Frame must contain exactly type, message_id, reactions — no extras."""
        event = {
            'type': 'reaction_update',
            'message_id': 'msg-clean',
            'reactions': [],
        }
        frames = await self._call_reaction_update(event)
        payload = json.loads(frames[0])
        self.assertSetEqual(set(payload.keys()), {'type', 'message_id', 'reactions'})
