import logging
import zoneinfo

from config.celery import app
from django.core.cache import cache
from django.utils import timezone as tz_util

logger = logging.getLogger(__name__)

# Local hours that trigger a reminder push (user's local time)
REMINDER_SLOTS = {
    9: {
        'title': "Get your day started! 🌅",
        'body': "Haven't logged a check-in yet — crush it this morning! 💪",
    },
    12: {
        'title': "Let's go! 🔥",
        'body': "Midday check — still no check-in logged. Make it happen! 🏃",
    },
    18: {
        'title': "Last chance today 🌆",
        'body': "Post your check-in or log a rest day before the day ends — don't lose your streak! 🔥",
    },
}


@app.task
def send_gym_reminders():
    """
    Runs every hour via Celery beat.

    At 9 AM, 12 PM, and 6 PM in each user's local timezone, sends a push
    notification to users who have not logged a check-in or rest day that day.
    Each user receives at most one push per slot (3 per day maximum).
    Deduplication is handled via cache so restarts cannot send duplicate pushes.
    """
    from accounts.models import User
    from accounts.push import send_push
    from workouts.models import RestDay, Streak
    from workouts.services.streak_service import _get_local_now, get_streak_date

    now_utc = tz_util.now()

    users = User.objects.filter(
        push_notifications=True,
        notify_workout_reminders=True,
        expo_push_token__gt='',
    )

    sent = 0
    for user in users:
        try:
            tz = zoneinfo.ZoneInfo(user.timezone or 'UTC')
        except Exception:
            tz = zoneinfo.ZoneInfo('UTC')

        local_now = now_utc.astimezone(tz)
        local_hour = local_now.hour

        if local_hour not in REMINDER_SLOTS:
            continue

        # Dedup: atomic add — only the first caller proceeds; concurrent runs skip
        local_today = local_now.date()
        cache_key = f'gym_reminder:{user.id}:{local_today}:{local_hour}'
        if not cache.add(cache_key, True, timeout=60 * 60 * 25):
            continue

        # Use same check as zap guard — respects the midnight-3AM grace window
        today_streak = get_streak_date(_get_local_now(user))
        streak_obj = Streak.objects.filter(user=user).first()
        has_checkin = streak_obj is not None and streak_obj.last_streak_date == today_streak
        has_rest_day = RestDay.objects.filter(user=user, streak_date=today_streak).exists()

        if not has_checkin and not has_rest_day:
            msg = REMINDER_SLOTS[local_hour]
            send_push(
                user.expo_push_token,
                title=msg['title'],
                body=msg['body'],
                data={'type': 'gym_reminder'},
            )
            sent += 1

    logger.info('send_gym_reminders: sent %d pushes', sent)
    return sent
