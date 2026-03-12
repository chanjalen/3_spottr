"""
Tests for the full workout invite flow.

Scenario covered end-to-end:
  1. Creator posts a gym workout invite
  2. Another user submits a join request → notify_workout_join_request fires
  3. Creator accepts the request →
       total_spots == 1  → DM Message + InboxEntry created
       total_spots  > 1  → Group + GroupMember records created
  4. Acceptances notification fires with correct context_type / context_id
  5. A second acceptance on a multi-person invite reuses the same group

Individual unit cases:
  - notify_workout_invite creates a DB Notification and calls send_push
  - notify_workout_join_request creates a DB Notification and calls send_push
  - notify_workout_join_request_accepted sets context_type='dm' for 1-on-1
  - notify_workout_join_request_accepted sets context_type='group' for multi-person
  - spots_available decrements on each acceptance
  - Denying a request sets status='deny', no messaging objects created
  - Creator cannot join their own invite
  - Expired invites are rejected
  - Full invites are rejected

Run:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test gyms.tests.test_workout_invites
"""

import datetime
import sys
from unittest.mock import MagicMock, call, patch

# Stub requests so push HTTP calls don't require the package or network
if 'requests' not in sys.modules:
    sys.modules['requests'] = MagicMock()

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from gyms.models import Gym, WorkoutInvite, JoinRequest
from gyms.services import (
    create_workout_invite,
    create_join_request,
    accept_join_request,
    deny_join_request,
)
from gyms.exceptions import (
    DuplicateJoinRequestError,
    InviteExpiredError,
    InviteFullError,
)
from notifications.dispatcher import (
    notify_workout_invite,
    notify_workout_join_request,
    notify_workout_join_request_accepted,
)
from notifications.models import Notification
from messaging.models import Message, InboxEntry
from groups.models import Group, GroupMember

# ---------------------------------------------------------------------------
# Patch targets
# ---------------------------------------------------------------------------

_SEND_PUSH = 'accounts.push.send_push'
_NOTIF_UNREAD = 'notifications.dispatcher._push_notification_unread'
_BROADCAST = 'messaging.services._broadcast'
_MSG_PUSH_UNREAD = 'messaging.services._push_unread_update'
_FANOUT = 'messaging.tasks.fanout_group_inbox'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(username, push_notifications=True, expo_push_token='ExponentPushToken[test]'):
    return User.objects.create_user(
        username=username,
        email=f'{username}@test.com',
        password='pw',
        birthday=datetime.date(1990, 1, 1),
        push_notifications=push_notifications,
        expo_push_token=expo_push_token,
        timezone='UTC',
    )


def make_gym(name='Test Gym'):
    return Gym.objects.create(name=name)


def make_invite(creator, gym, spots=1, invite_type='gym', invited_user=None,
                expires_in_hours=4):
    """Create a WorkoutInvite directly for test setup convenience."""
    return WorkoutInvite.objects.create(
        user=creator,
        gym=gym,
        description='Come lift with me',
        workout_type='Strength',
        scheduled_time=timezone.now() + datetime.timedelta(hours=2),
        spots_available=spots,
        total_spots=spots,
        type=invite_type,
        expires_at=timezone.now() + datetime.timedelta(hours=expires_in_hours),
        invited_user=invited_user,
    )


# ---------------------------------------------------------------------------
# Notification dispatcher unit tests
# ---------------------------------------------------------------------------

class TestNotifyWorkoutInvite(TestCase):
    """notify_workout_invite: creates a Notification record and sends a push."""

    def setUp(self):
        self.creator = make_user('creator')
        self.invitee = make_user('invitee')
        self.gym = make_gym()
        self.invite = make_invite(self.creator, self.gym, invite_type='individual',
                                  invited_user=self.invitee)

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_creates_notification_record(self, mock_push, mock_unread):
        notify_workout_invite(self.creator, self.invitee, self.invite)

        notif = Notification.objects.get(
            recipient=self.invitee,
            type=Notification.Type.WORKOUT_INVITE,
        )
        self.assertEqual(notif.triggered_by, self.creator)
        self.assertEqual(notif.target_id, str(self.invite.id))
        self.assertEqual(notif.target_type, Notification.TargetType.WORKOUT_INVITE)

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_sends_push_to_invitee(self, mock_push, mock_unread):
        notify_workout_invite(self.creator, self.invitee, self.invite)

        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        self.assertEqual(args[0], self.invitee.expo_push_token)
        self.assertIn('@creator', kwargs.get('body', args[2] if len(args) > 2 else ''))

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_no_self_notify(self, mock_push, mock_unread):
        """Creator inviting themselves creates nothing."""
        notify_workout_invite(self.creator, self.creator, self.invite)

        self.assertFalse(Notification.objects.filter(
            type=Notification.Type.WORKOUT_INVITE
        ).exists())
        mock_push.assert_not_called()


class TestNotifyWorkoutJoinRequest(TestCase):
    """notify_workout_join_request: notifies the invite owner when someone requests to join."""

    def setUp(self):
        self.creator = make_user('creator')
        self.requester = make_user('requester')
        self.gym = make_gym()
        self.invite = make_invite(self.creator, self.gym)
        self.join_request = JoinRequest.objects.create(
            workout_invite=self.invite,
            user=self.requester,
            description='Let me in',
        )

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_creates_notification_for_owner(self, mock_push, mock_unread):
        notify_workout_join_request(self.requester, self.invite, self.join_request)

        notif = Notification.objects.get(
            recipient=self.creator,
            type=Notification.Type.JOIN_REQUEST,
        )
        self.assertEqual(notif.triggered_by, self.requester)
        self.assertEqual(notif.target_id, str(self.invite.id))
        self.assertEqual(notif.context_id, str(self.join_request.id))

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_sends_push_to_owner(self, mock_push, mock_unread):
        notify_workout_join_request(self.requester, self.invite, self.join_request)

        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        self.assertEqual(args[0], self.creator.expo_push_token)


class TestNotifyWorkoutJoinRequestAccepted(TestCase):
    """notify_workout_join_request_accepted: correct context_type for DM vs group."""

    def setUp(self):
        self.creator = make_user('creator')
        self.requester = make_user('requester')
        self.gym = make_gym()

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_1on1_context_type_is_dm(self, mock_push, mock_unread):
        invite = make_invite(self.creator, self.gym, spots=1)

        notify_workout_join_request_accepted(self.creator, self.requester, invite)

        notif = Notification.objects.get(
            recipient=self.requester,
            type=Notification.Type.JOIN_ACCEPTED,
        )
        self.assertEqual(notif.context_type, 'dm')
        self.assertEqual(notif.context_id, str(self.creator.id))

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_multi_person_context_type_is_group(self, mock_push, mock_unread):
        invite = make_invite(self.creator, self.gym, spots=3)
        # Simulate a group chat already created
        group = Group.objects.create(
            created_by=self.creator,
            name='Strength at Test Gym',
            privacy=Group.Privacy.PRIVATE,
        )
        invite.workout_chat = group
        invite.save(update_fields=['workout_chat', 'updated_at'])

        notify_workout_join_request_accepted(self.creator, self.requester, invite)

        notif = Notification.objects.get(
            recipient=self.requester,
            type=Notification.Type.JOIN_ACCEPTED,
        )
        self.assertEqual(notif.context_type, 'group')
        self.assertEqual(notif.context_id, str(group.id))

    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_push_data_contains_correct_context(self, mock_push, mock_unread):
        invite = make_invite(self.creator, self.gym, spots=1)

        notify_workout_join_request_accepted(self.creator, self.requester, invite)

        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        data = kwargs.get('data', args[3] if len(args) > 3 else {})
        self.assertEqual(data['context_type'], 'dm')
        self.assertEqual(data['type'], 'join_accepted')


# ---------------------------------------------------------------------------
# accept_join_request: 1-on-1 flow (total_spots == 1)
# ---------------------------------------------------------------------------

class TestAcceptJoinRequest1on1(TestCase):
    """Accepting a join request on a 1-spot invite creates a DM conversation."""

    def setUp(self):
        self.creator = make_user('creator')
        self.requester = make_user('requester')
        self.gym = make_gym()
        self.invite = make_invite(self.creator, self.gym, spots=1)
        self.join_request = JoinRequest.objects.create(
            workout_invite=self.invite,
            user=self.requester,
            description='Let me in',
        )

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_join_request_status_set_to_accept(self, *mocks):
        accept_join_request(self.creator, self.join_request.id)

        self.join_request.refresh_from_db()
        self.assertEqual(self.join_request.status, JoinRequest.Status.ACCEPT)
        self.assertIsNotNone(self.join_request.joined_at)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_spots_available_decremented(self, *mocks):
        accept_join_request(self.creator, self.join_request.id)

        self.invite.refresh_from_db()
        self.assertEqual(self.invite.spots_available, 0)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_creates_dm_message(self, *mocks):
        accept_join_request(self.creator, self.join_request.id)

        msg = Message.objects.filter(
            sender=self.creator,
            recipient=self.requester,
            is_system=True,
        ).first()
        self.assertIsNotNone(msg)
        self.assertIn(self.gym.name, msg.content)
        self.assertIn('Strength', msg.content)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_inbox_entry_created_for_both_users(self, *mocks):
        accept_join_request(self.creator, self.join_request.id)

        creator_inbox = InboxEntry.objects.filter(
            user=self.creator, conversation_type='dm', partner=self.requester
        ).first()
        requester_inbox = InboxEntry.objects.filter(
            user=self.requester, conversation_type='dm', partner=self.creator
        ).first()
        self.assertIsNotNone(creator_inbox)
        self.assertIsNotNone(requester_inbox)
        # Creator reads immediately; requester gets unread=1
        self.assertEqual(creator_inbox.unread_count, 0)
        self.assertEqual(requester_inbox.unread_count, 1)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_no_group_created(self, *mocks):
        group_count_before = Group.objects.count()
        accept_join_request(self.creator, self.join_request.id)
        self.assertEqual(Group.objects.count(), group_count_before)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_join_accepted_notification_created(self, *mocks):
        accept_join_request(self.creator, self.join_request.id)

        notif = Notification.objects.filter(
            recipient=self.requester,
            type=Notification.Type.JOIN_ACCEPTED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.context_type, 'dm')
        self.assertEqual(notif.context_id, str(self.creator.id))

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_mutual_follow_created(self, *mocks):
        from social.models import Follow
        accept_join_request(self.creator, self.join_request.id)

        self.assertTrue(Follow.objects.filter(
            follower=self.creator, following=self.requester
        ).exists())
        self.assertTrue(Follow.objects.filter(
            follower=self.requester, following=self.creator
        ).exists())


# ---------------------------------------------------------------------------
# accept_join_request: multi-person flow (total_spots > 1)
# ---------------------------------------------------------------------------

class TestAcceptJoinRequestMultiPerson(TestCase):
    """Accepting a join request on a multi-spot invite creates a group chat."""

    def setUp(self):
        self.creator = make_user('creator')
        self.requester1 = make_user('requester1')
        self.requester2 = make_user('requester2')
        self.gym = make_gym()
        self.invite = make_invite(self.creator, self.gym, spots=3)
        self.jr1 = JoinRequest.objects.create(
            workout_invite=self.invite, user=self.requester1, description='In'
        )
        self.jr2 = JoinRequest.objects.create(
            workout_invite=self.invite, user=self.requester2, description='In'
        )

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_creates_group_on_first_acceptance(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        self.assertIsNotNone(self.invite.workout_chat_id)
        group = Group.objects.get(id=self.invite.workout_chat_id)
        self.assertEqual(group.privacy, Group.Privacy.PRIVATE)
        self.assertIn('Strength', group.name)
        self.assertIn(self.gym.name, group.name)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_creator_added_as_creator_member(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        membership = GroupMember.objects.get(
            group=self.invite.workout_chat, user=self.creator
        )
        self.assertEqual(membership.role, GroupMember.Role.CREATOR)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_requester_added_as_member(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        membership = GroupMember.objects.get(
            group=self.invite.workout_chat, user=self.requester1
        )
        self.assertEqual(membership.role, GroupMember.Role.MEMBER)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_second_acceptance_reuses_same_group(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)
        self.invite.refresh_from_db()
        group_id_after_first = self.invite.workout_chat_id

        accept_join_request(self.creator, self.jr2.id)
        self.invite.refresh_from_db()

        self.assertEqual(self.invite.workout_chat_id, group_id_after_first)
        self.assertEqual(Group.objects.count(), 1)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_second_requester_added_to_existing_group(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)
        accept_join_request(self.creator, self.jr2.id)

        self.invite.refresh_from_db()
        member_ids = set(
            GroupMember.objects.filter(group=self.invite.workout_chat)
            .values_list('user_id', flat=True)
        )
        self.assertIn(self.creator.id, member_ids)
        self.assertIn(self.requester1.id, member_ids)
        self.assertIn(self.requester2.id, member_ids)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_group_system_message_created(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        msg = Message.objects.filter(
            group=self.invite.workout_chat, is_system=True
        ).first()
        self.assertIsNotNone(msg)
        self.assertIn('joined', msg.content)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_inbox_entry_created_for_both_on_first_acceptance(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        creator_inbox = InboxEntry.objects.filter(
            user=self.creator, conversation_type='group', group=self.invite.workout_chat
        ).first()
        requester_inbox = InboxEntry.objects.filter(
            user=self.requester1, conversation_type='group', group=self.invite.workout_chat
        ).first()
        self.assertIsNotNone(creator_inbox)
        self.assertIsNotNone(requester_inbox)
        self.assertEqual(creator_inbox.unread_count, 0)
        self.assertEqual(requester_inbox.unread_count, 1)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_join_accepted_notification_context_is_group(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        self.invite.refresh_from_db()
        notif = Notification.objects.filter(
            recipient=self.requester1,
            type=Notification.Type.JOIN_ACCEPTED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.context_type, 'group')
        self.assertEqual(notif.context_id, str(self.invite.workout_chat_id))

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_spots_decrement_across_acceptances(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)
        self.invite.refresh_from_db()
        self.assertEqual(self.invite.spots_available, 2)

        accept_join_request(self.creator, self.jr2.id)
        self.invite.refresh_from_db()
        self.assertEqual(self.invite.spots_available, 1)

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_no_dm_message_created(self, *mocks):
        accept_join_request(self.creator, self.jr1.id)

        dm_messages = Message.objects.filter(
            sender=self.creator, recipient=self.requester1
        )
        self.assertFalse(dm_messages.exists())


# ---------------------------------------------------------------------------
# deny_join_request
# ---------------------------------------------------------------------------

class TestDenyJoinRequest(TestCase):

    def setUp(self):
        self.creator = make_user('creator')
        self.requester = make_user('requester')
        self.gym = make_gym()
        self.invite = make_invite(self.creator, self.gym, spots=1)
        self.join_request = JoinRequest.objects.create(
            workout_invite=self.invite,
            user=self.requester,
            description='Please',
        )

    def test_sets_status_to_deny(self):
        deny_join_request(self.creator, self.join_request.id)

        self.join_request.refresh_from_db()
        self.assertEqual(self.join_request.status, JoinRequest.Status.DENY)

    def test_no_message_or_group_created(self):
        deny_join_request(self.creator, self.join_request.id)

        self.assertFalse(Message.objects.exists())
        self.assertFalse(Group.objects.exists())

    def test_spots_not_decremented(self):
        spots_before = self.invite.spots_available
        deny_join_request(self.creator, self.join_request.id)

        self.invite.refresh_from_db()
        self.assertEqual(self.invite.spots_available, spots_before)


# ---------------------------------------------------------------------------
# create_join_request: validation guards
# ---------------------------------------------------------------------------

class TestCreateJoinRequestValidation(TestCase):

    def setUp(self):
        self.creator = make_user('creator')
        self.requester = make_user('requester')
        self.gym = make_gym()

    def test_creator_cannot_join_own_invite(self):
        invite = make_invite(self.creator, self.gym, spots=2)
        with self.assertRaises(DuplicateJoinRequestError):
            create_join_request(self.creator, invite.id, 'self-join')

    def test_expired_invite_rejected(self):
        invite = make_invite(self.creator, self.gym, spots=2, expires_in_hours=-1)
        with self.assertRaises(InviteExpiredError):
            create_join_request(self.requester, invite.id, 'too late')

    def test_full_invite_rejected(self):
        invite = make_invite(self.creator, self.gym, spots=1)
        # Fill the spot
        invite.spots_available = 0
        invite.save(update_fields=['spots_available', 'updated_at'])
        with self.assertRaises(InviteFullError):
            create_join_request(self.requester, invite.id, 'no room')

    def test_duplicate_join_request_rejected(self):
        invite = make_invite(self.creator, self.gym, spots=2)
        create_join_request(self.requester, invite.id, 'first')
        with self.assertRaises(DuplicateJoinRequestError):
            create_join_request(self.requester, invite.id, 'second')


# ---------------------------------------------------------------------------
# Full end-to-end flow
# ---------------------------------------------------------------------------

class TestWorkoutInviteFullFlow(TestCase):
    """
    End-to-end: creator posts invite → requester joins → creator accepts →
    correct conversation type created and all notifications fired.
    """

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_1on1_full_flow(self, mock_push, mock_notif_unread, mock_broadcast,
                             mock_msg_unread, mock_fanout):
        creator = make_user('alice')
        requester = make_user('bob')
        gym = make_gym('Iron World')

        # 1. Creator posts an individual invite
        invite = make_invite(creator, gym, spots=1, invite_type='individual',
                              invited_user=requester)
        notify_workout_invite(creator, requester, invite)

        self.assertEqual(
            Notification.objects.filter(
                recipient=requester, type=Notification.Type.WORKOUT_INVITE
            ).count(), 1
        )

        # 2. Requester submits join request
        jr = create_join_request(requester, invite.id, 'Ready to grind')
        notify_workout_join_request(requester, invite, jr)

        self.assertEqual(
            Notification.objects.filter(
                recipient=creator, type=Notification.Type.JOIN_REQUEST
            ).count(), 1
        )

        # 3. Creator accepts
        accept_join_request(creator, jr.id)

        jr.refresh_from_db()
        self.assertEqual(jr.status, JoinRequest.Status.ACCEPT)

        # DM created
        self.assertTrue(
            Message.objects.filter(sender=creator, recipient=requester, is_system=True).exists()
        )

        # Accepted notification with dm context
        notif = Notification.objects.get(
            recipient=requester, type=Notification.Type.JOIN_ACCEPTED
        )
        self.assertEqual(notif.context_type, 'dm')

    @patch(_FANOUT)
    @patch(_MSG_PUSH_UNREAD)
    @patch(_BROADCAST)
    @patch(_NOTIF_UNREAD)
    @patch(_SEND_PUSH)
    def test_multi_person_full_flow(self, mock_push, mock_notif_unread, mock_broadcast,
                                    mock_msg_unread, mock_fanout):
        creator = make_user('coach')
        bob = make_user('bob')
        carol = make_user('carol')
        gym = make_gym('Power Gym')

        # Gym invite with 2 spots
        invite = make_invite(creator, gym, spots=2, invite_type='gym')

        # Both request to join
        jr_bob = create_join_request(bob, invite.id, 'In')
        jr_carol = create_join_request(carol, invite.id, 'In too')

        # Accept bob → group created
        accept_join_request(creator, jr_bob.id)
        invite.refresh_from_db()
        group = invite.workout_chat
        self.assertIsNotNone(group)

        notif_bob = Notification.objects.get(
            recipient=bob, type=Notification.Type.JOIN_ACCEPTED
        )
        self.assertEqual(notif_bob.context_type, 'group')
        self.assertEqual(notif_bob.context_id, str(group.id))

        # Accept carol → same group reused, carol added as member
        accept_join_request(creator, jr_carol.id)
        invite.refresh_from_db()
        self.assertEqual(invite.workout_chat_id, group.id)

        member_ids = set(
            GroupMember.objects.filter(group=group).values_list('user_id', flat=True)
        )
        self.assertEqual(member_ids, {creator.id, bob.id, carol.id})

        notif_carol = Notification.objects.get(
            recipient=carol, type=Notification.Type.JOIN_ACCEPTED
        )
        self.assertEqual(notif_carol.context_type, 'group')
        self.assertEqual(notif_carol.context_id, str(group.id))

        # Spots should be 0
        invite.refresh_from_db()
        self.assertEqual(invite.spots_available, 0)
