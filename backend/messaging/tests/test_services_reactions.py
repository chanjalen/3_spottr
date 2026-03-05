"""
Tests for messaging.services.broadcast_reaction_update

These tests cover:
- Correct channel targets (DM → two channels, group → one channel)
- Payload shape: type, message_id, reactions[]{emoji, count, reactor_ids}
- reactor_ids correctly identify who reacted
- Empty reactions broadcast an empty list
- Multiple emojis are sorted by count desc
- Exceptions from the channel layer are swallowed (never leak to callers)
- A missing channel layer is a no-op

Run:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test \
        messaging.tests.test_services_reactions
"""

import datetime
from unittest.mock import MagicMock, call, patch

from django.test import TestCase

from messaging.models import Message, MessageReaction
from messaging.services import broadcast_reaction_update


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(email, username=None):
    from accounts.models import User
    username = username or email.split('@')[0]
    return User.objects.create_user(
        email=email,
        username=username,
        birthday=datetime.date(1995, 6, 15),
        password='TestPass123!',
    )


def make_group(creator, name='Test Group'):
    from groups.models import Group
    return Group.objects.create(created_by=creator, name=name)


def make_dm_message(sender, recipient, content='hello'):
    return Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=content,
    )


def make_group_message(sender, group, content='hello group'):
    return Message.objects.create(
        sender=sender,
        group=group,
        content=content,
    )


def _clean_id(value):
    return str(value).replace('-', '')


# ---------------------------------------------------------------------------
# Patch helpers
# ---------------------------------------------------------------------------

def _make_mock_layer():
    """Return a MagicMock channel layer whose group_send is a plain callable."""
    layer = MagicMock()
    layer.group_send = MagicMock()
    return layer


# We patch both imports that broadcast_reaction_update uses inside the function.
# async_to_sync is replaced with the identity function so group_send is called directly.
PATCH_GET_LAYER = 'channels.layers.get_channel_layer'
PATCH_A2S = 'asgiref.sync.async_to_sync'


class BroadcastReactionUpdateDMTests(TestCase):
    """DM message → broadcast reaches both the sender's and recipient's DM channel."""

    def setUp(self):
        self.sender = make_user('alice@example.com', 'alice')
        self.recipient = make_user('bob@example.com', 'bob')
        self.message = make_dm_message(self.sender, self.recipient)

    def _run(self, mock_layer):
        """Patch the channel layer and async_to_sync, then call the service."""
        with patch(PATCH_GET_LAYER, return_value=mock_layer), \
             patch(PATCH_A2S, side_effect=lambda f: f):
            broadcast_reaction_update(self.message)

    def test_broadcasts_to_sender_dm_channel(self):
        layer = _make_mock_layer()
        self._run(layer)
        expected_group = f"dm_{_clean_id(self.sender.id)}"
        groups_called = [c.args[0] for c in layer.group_send.call_args_list]
        self.assertIn(expected_group, groups_called)

    def test_broadcasts_to_recipient_dm_channel(self):
        layer = _make_mock_layer()
        self._run(layer)
        expected_group = f"dm_{_clean_id(self.recipient.id)}"
        groups_called = [c.args[0] for c in layer.group_send.call_args_list]
        self.assertIn(expected_group, groups_called)

    def test_broadcasts_to_exactly_two_channels(self):
        layer = _make_mock_layer()
        self._run(layer)
        self.assertEqual(layer.group_send.call_count, 2)

    def test_payload_type_is_reaction_update(self):
        layer = _make_mock_layer()
        self._run(layer)
        for c in layer.group_send.call_args_list:
            payload = c.args[1]
            self.assertEqual(payload['type'], 'reaction_update')

    def test_payload_message_id_matches(self):
        layer = _make_mock_layer()
        self._run(layer)
        for c in layer.group_send.call_args_list:
            payload = c.args[1]
            self.assertEqual(payload['message_id'], str(self.message.id))

    def test_payload_has_reactions_key(self):
        layer = _make_mock_layer()
        self._run(layer)
        payload = layer.group_send.call_args_list[0].args[1]
        self.assertIn('reactions', payload)

    def test_empty_reactions_payload(self):
        """No reactions yet → reactions list is empty."""
        layer = _make_mock_layer()
        self._run(layer)
        payload = layer.group_send.call_args_list[0].args[1]
        self.assertEqual(payload['reactions'], [])

    def test_reactor_ids_contains_reactors(self):
        """reactor_ids should list every user who reacted with that emoji."""
        reactor = make_user('reactor@example.com', 'reactor')
        MessageReaction.objects.create(message=self.message, user=reactor, emoji='👍')
        layer = _make_mock_layer()
        self._run(layer)

        payload = layer.group_send.call_args_list[0].args[1]
        reaction = payload['reactions'][0]
        self.assertIn(str(reactor.id), reaction['reactor_ids'])

    def test_reactor_ids_does_not_contain_non_reactors(self):
        """Non-reactors must NOT appear in reactor_ids."""
        reactor = make_user('reactor@example.com', 'reactor')
        outsider = make_user('outsider@example.com', 'outsider')
        MessageReaction.objects.create(message=self.message, user=reactor, emoji='👍')
        layer = _make_mock_layer()
        self._run(layer)

        payload = layer.group_send.call_args_list[0].args[1]
        reaction = payload['reactions'][0]
        self.assertNotIn(str(outsider.id), reaction['reactor_ids'])

    def test_count_matches_number_of_reactors(self):
        """count must equal the number of users who used that emoji."""
        u1 = make_user('u1@example.com', 'u1')
        u2 = make_user('u2@example.com', 'u2')
        MessageReaction.objects.create(message=self.message, user=u1, emoji='🔥')
        MessageReaction.objects.create(message=self.message, user=u2, emoji='🔥')
        layer = _make_mock_layer()
        self._run(layer)

        payload = layer.group_send.call_args_list[0].args[1]
        reaction = next(r for r in payload['reactions'] if r['emoji'] == '🔥')
        self.assertEqual(reaction['count'], 2)
        self.assertIn(str(u1.id), reaction['reactor_ids'])
        self.assertIn(str(u2.id), reaction['reactor_ids'])

    def test_multiple_emojis_sorted_by_count_desc(self):
        """Higher-count emojis come first in the reactions list."""
        u1 = make_user('ua@example.com', 'ua')
        u2 = make_user('ub@example.com', 'ub')
        u3 = make_user('uc@example.com', 'uc')
        # 👍 has 2 reactors, ❤️ has 1
        MessageReaction.objects.create(message=self.message, user=u1, emoji='👍')
        MessageReaction.objects.create(message=self.message, user=u2, emoji='👍')
        MessageReaction.objects.create(message=self.message, user=u3, emoji='❤️')
        layer = _make_mock_layer()
        self._run(layer)

        payload = layer.group_send.call_args_list[0].args[1]
        reactions = payload['reactions']
        self.assertEqual(reactions[0]['emoji'], '👍')   # count=2 first
        self.assertEqual(reactions[1]['emoji'], '❤️')   # count=1 second


class BroadcastReactionUpdateGroupTests(TestCase):
    """Group message → broadcast reaches exactly the group's channel."""

    def setUp(self):
        self.creator = make_user('creator@example.com', 'creator')
        self.member = make_user('member@example.com', 'member')
        self.group = make_group(self.creator)
        self.message = make_group_message(self.creator, self.group)

    def _run(self, mock_layer):
        with patch(PATCH_GET_LAYER, return_value=mock_layer), \
             patch(PATCH_A2S, side_effect=lambda f: f):
            broadcast_reaction_update(self.message)

    def test_broadcasts_to_group_channel(self):
        layer = _make_mock_layer()
        self._run(layer)
        expected_group = f"group_{_clean_id(self.group.id)}"
        groups_called = [c.args[0] for c in layer.group_send.call_args_list]
        self.assertIn(expected_group, groups_called)

    def test_broadcasts_to_exactly_one_channel(self):
        layer = _make_mock_layer()
        self._run(layer)
        self.assertEqual(layer.group_send.call_count, 1)

    def test_payload_type_is_reaction_update(self):
        layer = _make_mock_layer()
        self._run(layer)
        payload = layer.group_send.call_args_list[0].args[1]
        self.assertEqual(payload['type'], 'reaction_update')

    def test_payload_message_id_matches(self):
        layer = _make_mock_layer()
        self._run(layer)
        payload = layer.group_send.call_args_list[0].args[1]
        self.assertEqual(payload['message_id'], str(self.message.id))

    def test_multiple_reactors_all_appear_in_reactor_ids(self):
        from groups.models import GroupMember
        GroupMember.objects.create(group=self.group, user=self.member)
        MessageReaction.objects.create(message=self.message, user=self.creator, emoji='💪')
        MessageReaction.objects.create(message=self.message, user=self.member, emoji='💪')
        layer = _make_mock_layer()
        self._run(layer)

        payload = layer.group_send.call_args_list[0].args[1]
        reaction = payload['reactions'][0]
        self.assertIn(str(self.creator.id), reaction['reactor_ids'])
        self.assertIn(str(self.member.id), reaction['reactor_ids'])
        self.assertEqual(reaction['count'], 2)


class BroadcastReactionUpdateErrorHandlingTests(TestCase):
    """The function must never raise, even when the channel layer misbehaves."""

    def setUp(self):
        self.sender = make_user('sender@example.com', 'sender')
        self.recipient = make_user('recv@example.com', 'recv')
        self.message = make_dm_message(self.sender, self.recipient)

    def test_none_channel_layer_is_silent_no_op(self):
        """When get_channel_layer returns None, no exception is raised."""
        with patch(PATCH_GET_LAYER, return_value=None):
            try:
                broadcast_reaction_update(self.message)
            except Exception as exc:
                self.fail(f"broadcast_reaction_update raised unexpectedly: {exc}")

    def test_channel_layer_exception_is_swallowed(self):
        """When group_send raises, the exception must not propagate."""
        layer = _make_mock_layer()
        layer.group_send.side_effect = RuntimeError("Redis down")
        with patch(PATCH_GET_LAYER, return_value=layer), \
             patch(PATCH_A2S, side_effect=lambda f: f):
            try:
                broadcast_reaction_update(self.message)
            except Exception as exc:
                self.fail(f"broadcast_reaction_update raised unexpectedly: {exc}")
