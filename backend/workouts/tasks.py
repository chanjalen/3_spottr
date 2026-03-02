import zoneinfo
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from workouts.services.streak_service import get_streak_date, _check_gap_protected
from workouts.models import Streak


@shared_task
def reset_broken_streaks():
    """
    Runs every hour via Celery beat.

    For each user whose local clock has just passed 3 AM (i.e., their local
    hour is currently 3), check whether yesterday (in their local time) was
    covered by a workout or a valid rest day.  If not, reset current_streak
    to 0.

    The 3AM window is intentionally loose: we run every hour and only act on
    users whose local hour == 3, so each user is evaluated at most once per
    day (the hour immediately after the 3AM streak cutoff).
    """
    from accounts.models import User

    now_utc = timezone.now()

    # Pull all users who still have a non-zero streak — no point processing the rest
    users = User.objects.filter(current_streak__gt=0).select_related('streak')

    to_reset = []

    for user in users:
        try:
            tz = zoneinfo.ZoneInfo(user.timezone or 'UTC')
        except (zoneinfo.ZoneInfoNotFoundError, KeyError):
            tz = zoneinfo.ZoneInfo('UTC')

        local_now = now_utc.astimezone(tz)

        # Only act during the 3 AM hour in the user's timezone
        if local_now.hour != 3:
            continue

        # "today" in streak terms for this user's local time
        today_streak = get_streak_date(local_now)
        yesterday = today_streak - timedelta(days=1)

        streak_obj = getattr(user, 'streak', None)
        if streak_obj is None:
            continue

        last = streak_obj.last_streak_date
        if last is None:
            continue

        # If they already logged something today or yesterday, streak is fine
        if last >= yesterday:
            continue

        # Gap exists — check if rest days cover it
        gap_start = last + timedelta(days=1)
        gap_end = yesterday

        if not _check_gap_protected(user, gap_start, gap_end):
            to_reset.append(user.pk)

    if to_reset:
        User.objects.filter(pk__in=to_reset).update(current_streak=0)
