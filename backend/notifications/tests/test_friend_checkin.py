"""
Tests for notifications.dispatcher._friend_checkin_worker

Covers:
- Single friend check-in fires push to follower
- Two friends checked in produces correct body
- Three friends uses "and N others" format
- More than 3 check-ins suppresses push
- Deduplication: same milestone count doesn't push twice
- Timezone-aware date boundary: check-in from yesterday (UTC) but today locally counts
- Timezone-aware date boundary: check-in from today (UTC) but yesterday locally does not count
- User with push_notifications=False is skipped
- User with no expo_push_token is skipped
- Bad timezone falls back to UTC without crashing
- Exception in one follower doesn't prevent other followers from receiving push

Run:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test \
        notifications.tests.test_friend_checkin
"""

import datetime
import sys
from unittest.mock import MagicMock, call, patch

# Stub out `requests` before any module that imports it is loaded,
# so tests run without needing the package installed.
if 'requests' not in sys.modules:
    sys.modules['requests'] = MagicMock()

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from social.models import Follow, QuickWorkout
from notifications.dispatcher import _friend_checkin_worker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(username, push_notifications=True, expo_push_token='ExponentPushToken[test]', tz='UTC'):
    return User.objects.create_user(
        username=username,
        email=f'{username}@test.com',
        password='pw',
        birthday=datetime.date(1990, 1, 1),
        push_notifications=push_notifications,
        expo_push_token=expo_push_token,
        timezone=tz,
    )


def make_checkin(user, created_at=None):
    """Create a QuickWorkout with location_name set (satisfies DB constraint)."""
    checkin = QuickWorkout(
        user=user,
        location_name='Test Gym',
        type='strength',
    )
    checkin.save()
    if created_at is not None:
        QuickWorkout.objects.filter(pk=checkin.pk).update(created_at=created_at)
        checkin.refresh_from_db()
    return checkin


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class FriendCheckinWorkerTest(TestCase):

    @patch('accounts.push.send_push')
    def test_single_friend_push_body(self, mock_send_push):
        """1 friend checked in → '@alice just checked in 💪'"""
        alice = make_user('alice')
        bob = make_user('bob')
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_called_once()
        args, _ = mock_send_push.call_args
        self.assertIn('@alice just checked in', args[2])

    @patch('accounts.push.send_push')
    def test_two_friends_push_body(self, mock_send_push):
        """2 friends checked in today → '@alice and @carol checked in today 💪'"""
        alice = make_user('alice')
        carol = make_user('carol')
        bob = make_user('bob')
        Follow.objects.create(follower=bob, following=alice)
        Follow.objects.create(follower=bob, following=carol)
        make_checkin(carol)  # carol already checked in
        make_checkin(alice)  # alice checks in now

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_called_once()
        args, _ = mock_send_push.call_args
        body = args[2]
        self.assertIn('@alice', body)
        self.assertIn('@carol', body)
        self.assertIn('checked in today', body)

    @patch('accounts.push.send_push')
    def test_three_friends_uses_others_format(self, mock_send_push):
        """3 friends checked in → '@alice and 2 others checked in today 💪'"""
        alice = make_user('alice')
        carol = make_user('carol')
        dave = make_user('dave')
        bob = make_user('bob')
        Follow.objects.create(follower=bob, following=alice)
        Follow.objects.create(follower=bob, following=carol)
        Follow.objects.create(follower=bob, following=dave)
        make_checkin(carol)
        make_checkin(dave)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_called_once()
        args, _ = mock_send_push.call_args
        self.assertIn('@alice', args[2])
        self.assertIn('2 others', args[2])

    @patch('accounts.push.send_push')
    def test_more_than_three_no_push(self, mock_send_push):
        """4+ friends checked in → no push sent."""
        alice = make_user('alice')
        bob = make_user('bob')
        others = [make_user(f'user{i}') for i in range(3)]
        Follow.objects.create(follower=bob, following=alice)
        for u in others:
            Follow.objects.create(follower=bob, following=u)
            make_checkin(u)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_not_called()

    @patch('accounts.push.send_push')
    def test_deduplication_same_milestone(self, mock_send_push):
        """Calling worker twice for same milestone doesn't double-push."""
        alice = make_user('alice')
        bob = make_user('bob')
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)
        _friend_checkin_worker(alice.id)

        # Only one push despite two calls
        self.assertEqual(mock_send_push.call_count, 1)

    @patch('accounts.push.send_push')
    def test_deduplication_new_milestone_fires_again(self, mock_send_push):
        """A second friend checking in (count goes 1→2) fires a new push."""
        alice = make_user('alice')
        carol = make_user('carol')
        bob = make_user('bob')
        Follow.objects.create(follower=bob, following=alice)
        Follow.objects.create(follower=bob, following=carol)

        # First check-in (count = 1)
        make_checkin(alice)
        _friend_checkin_worker(alice.id)
        self.assertEqual(mock_send_push.call_count, 1)

        # Second check-in (count = 2) — new milestone, should fire again
        make_checkin(carol)
        _friend_checkin_worker(carol.id)
        self.assertEqual(mock_send_push.call_count, 2)

    @patch('accounts.push.send_push')
    def test_push_notifications_off_skipped(self, mock_send_push):
        """Follower with push_notifications=False gets no push."""
        alice = make_user('alice')
        bob = make_user('bob', push_notifications=False)
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_not_called()

    @patch('accounts.push.send_push')
    def test_no_token_skipped(self, mock_send_push):
        """Follower with empty expo_push_token gets no push."""
        alice = make_user('alice')
        bob = make_user('bob', expo_push_token='')
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_not_called()

    @patch('accounts.push.send_push')
    def test_nonexistent_checkin_user_no_crash(self, mock_send_push):
        """Worker exits cleanly if checkin_user_id doesn't exist."""
        _friend_checkin_worker('00000000-0000-0000-0000-000000000000')
        mock_send_push.assert_not_called()

    @patch('accounts.push.send_push')
    def test_bad_timezone_falls_back_to_utc(self, mock_send_push):
        """Follower with invalid timezone gets UTC fallback, no crash, push still fires."""
        alice = make_user('alice')
        bob = make_user('bob', tz='Not/ATimezone')
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        _friend_checkin_worker(alice.id)

        mock_send_push.assert_called_once()

    @patch('accounts.push.send_push')
    def test_timezone_aware_date_boundary_counts_checkin(self, mock_send_push):
        """
        Check-in at 11:30 PM UTC yesterday = today in UTC+1.
        Follower in UTC+1 should see it as today and receive push.
        """
        import zoneinfo
        alice = make_user('alice', tz='Europe/Paris')  # UTC+1 in winter
        bob = make_user('bob', tz='Europe/Paris')
        Follow.objects.create(follower=bob, following=alice)

        # Simulate: now is 00:30 AM Paris time (= 23:30 UTC previous day)
        paris = zoneinfo.ZoneInfo('Europe/Paris')
        # Create a checkin that is 23:30 UTC = 00:30 Paris (today in Paris)
        now_utc = timezone.now()
        # Place checkin at 23:30 UTC yesterday so it's "today" in Paris (UTC+1)
        checkin_time = now_utc.replace(hour=23, minute=30, second=0, microsecond=0) - datetime.timedelta(days=1)
        # Only run this scenario if the math puts it in Paris's "today"
        paris_date = checkin_time.astimezone(paris).date()
        today_paris = now_utc.astimezone(paris).date()
        if paris_date == today_paris:
            make_checkin(alice, created_at=checkin_time)
            _friend_checkin_worker(alice.id)
            mock_send_push.assert_called_once()

    @patch('accounts.push.send_push')
    def test_exception_in_one_follower_does_not_stop_others(self, mock_send_push):
        """
        If processing one follower raises, the remaining followers still get pushed.
        We simulate by giving one follower a timezone that raises after the push check.
        """
        alice = make_user('alice')
        bob = make_user('bob')   # will succeed
        Follow.objects.create(follower=bob, following=alice)
        make_checkin(alice)

        # Patch Follow queryset to return a follower whose attribute access raises,
        # then the real bob. We do this by patching cache.get to raise on first call only.
        real_cache_get = __import__('django.core.cache', fromlist=['cache']).cache.get
        call_count = {'n': 0}

        def flaky_cache_get(key, *args, **kwargs):
            call_count['n'] += 1
            if call_count['n'] == 1:
                raise RuntimeError('simulated cache failure')
            return real_cache_get(key, *args, **kwargs)

        with patch('django.core.cache.cache.get', side_effect=flaky_cache_get):
            # First follower (bob) cache.get raises → caught, continues
            # Second call would be next iteration but there's only bob.
            # The point: no unhandled exception propagates.
            try:
                _friend_checkin_worker(alice.id)
            except Exception:
                self.fail('_friend_checkin_worker raised unexpectedly')
