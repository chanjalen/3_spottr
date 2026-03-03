"""
Tests for the react_to_message view (POST /api/messaging/messages/<id>/react/)

Covers:
- broadcast_reaction_update is called after a successful toggle
- HTTP response is unchanged: {"reactions": [...]} with user_reacted for the requester
- broadcast is NOT called when the message is not found (404 path)
- broadcast is NOT called when the user has no access (403 path)

Run:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test \
        messaging.tests.test_views_reactions
"""

import datetime
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from messaging.models import Message, MessageReaction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PATCH_BROADCAST = 'messaging.services.broadcast_reaction_update'


def make_user(email, username=None):
    from accounts.models import User
    username = username or email.split('@')[0]
    return User.objects.create_user(
        email=email,
        username=username,
        birthday=datetime.date(1995, 6, 15),
        password='TestPass123!',
    )


def auth_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return client


def make_dm_message(sender, recipient, content='hi'):
    return Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=content,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class ReactToMessageBroadcastTests(TestCase):
    """Verify broadcast_reaction_update is called (or not) by the view."""

    def setUp(self):
        self.sender = make_user('sender@example.com', 'sender')
        self.recipient = make_user('recipient@example.com', 'recipient')
        self.message = make_dm_message(self.sender, self.recipient)
        self.client = auth_client(self.sender)
        self.url = f'/api/messaging/messages/{self.message.id}/react/'

    def test_broadcast_called_on_successful_reaction(self):
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = self.client.post(self.url, {'emoji': '👍'}, format='json')
        self.assertEqual(response.status_code, 200)
        mock_broadcast.assert_called_once()
        # The message object passed to broadcast must match our message
        called_msg = mock_broadcast.call_args.args[0]
        self.assertEqual(str(called_msg.id), str(self.message.id))

    def test_broadcast_called_on_reaction_toggle_off(self):
        """Toggling an existing reaction off still triggers a broadcast."""
        MessageReaction.objects.create(
            message=self.message, user=self.sender, emoji='👍'
        )
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = self.client.post(self.url, {'emoji': '👍'}, format='json')
        self.assertEqual(response.status_code, 200)
        mock_broadcast.assert_called_once()

    def test_broadcast_not_called_when_message_not_found(self):
        fake_url = '/api/messaging/messages/00000000-0000-0000-0000-000000000000/react/'
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = self.client.post(fake_url, {'emoji': '👍'}, format='json')
        self.assertEqual(response.status_code, 404)
        mock_broadcast.assert_not_called()

    def test_broadcast_not_called_when_user_has_no_access(self):
        """A user unrelated to the conversation must get 403, not trigger broadcast."""
        outsider = make_user('outsider@example.com', 'outsider')
        outsider_client = auth_client(outsider)
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = outsider_client.post(self.url, {'emoji': '👍'}, format='json')
        self.assertEqual(response.status_code, 403)
        mock_broadcast.assert_not_called()


class ReactToMessageResponseTests(TestCase):
    """Verify the HTTP response shape is unchanged after adding broadcast."""

    def setUp(self):
        self.sender = make_user('alice@example.com', 'alice')
        self.recipient = make_user('bob@example.com', 'bob')
        self.message = make_dm_message(self.sender, self.recipient)
        self.client = auth_client(self.sender)
        self.url = f'/api/messaging/messages/{self.message.id}/react/'

    def test_response_has_reactions_key(self):
        with patch(PATCH_BROADCAST):
            response = self.client.post(self.url, {'emoji': '👍'}, format='json')
        self.assertIn('reactions', response.data)

    def test_requester_user_reacted_is_true_after_adding(self):
        with patch(PATCH_BROADCAST):
            response = self.client.post(self.url, {'emoji': '👍'}, format='json')
        reaction = next(
            (r for r in response.data['reactions'] if r['emoji'] == '👍'), None
        )
        self.assertIsNotNone(reaction)
        self.assertTrue(reaction['user_reacted'])

    def test_requester_user_reacted_is_false_after_toggling_off(self):
        MessageReaction.objects.create(
            message=self.message, user=self.sender, emoji='👍'
        )
        with patch(PATCH_BROADCAST):
            response = self.client.post(self.url, {'emoji': '👍'}, format='json')
        # Reaction was removed → should not appear at all
        emojis = [r['emoji'] for r in response.data['reactions']]
        self.assertNotIn('👍', emojis)

    def test_count_reflects_current_state(self):
        """After a second user reacts, count should be 2."""
        MessageReaction.objects.create(
            message=self.message, user=self.recipient, emoji='🔥'
        )
        with patch(PATCH_BROADCAST):
            # Sender also reacts with 🔥
            response = self.client.post(
                self.url, {'emoji': '🔥'}, format='json'
            )
        reaction = next(
            (r for r in response.data['reactions'] if r['emoji'] == '🔥'), None
        )
        self.assertEqual(reaction['count'], 2)

    def test_invalid_request_returns_400_no_broadcast(self):
        """Missing emoji field → 400, broadcast not called."""
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        mock_broadcast.assert_not_called()

    def test_unauthenticated_returns_401_no_broadcast(self):
        anon_client = APIClient()
        with patch(PATCH_BROADCAST) as mock_broadcast:
            response = anon_client.post(self.url, {'emoji': '👍'}, format='json')
        self.assertEqual(response.status_code, 401)
        mock_broadcast.assert_not_called()
