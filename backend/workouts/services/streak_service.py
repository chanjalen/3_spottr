import zoneinfo
from datetime import date, timedelta
from django.utils import timezone
from django.db import transaction

from workouts.models import Streak, RestDay


def _get_local_now(user):
    """Return the current datetime converted to the user's stored timezone."""
    tz_str = getattr(user, 'timezone', None) or 'UTC'
    try:
        tz = zoneinfo.ZoneInfo(tz_str)
    except (zoneinfo.ZoneInfoNotFoundError, KeyError):
        tz = zoneinfo.ZoneInfo('UTC')
    return timezone.now().astimezone(tz)


def get_streak_date(dt=None):
    """
    Convert a datetime to a "streak date".
    If hour < 3 (midnight-3AM), count as previous day.
    This allows late-night workouts to count for the previous day.
    """
    if dt is None:
        dt = timezone.now()
    if hasattr(dt, 'hour'):
        if dt.hour < 3:
            return (dt - timedelta(days=1)).date() if hasattr(dt, 'date') else dt - timedelta(days=1)
        return dt.date() if hasattr(dt, 'date') else dt
    return dt


def update_streak(user, activity_type='workout'):
    """
    Update the user's streak after a workout or check-in.
    Uses select_for_update for race safety.
    Returns dict with streak info.
    """
    today_streak = get_streak_date(_get_local_now(user))

    with transaction.atomic():
        streak_obj, created = Streak.objects.select_for_update().get_or_create(
            user=user
        )

        # Already counted today
        if streak_obj.last_streak_date == today_streak:
            return {
                'current_streak': user.current_streak,
                'already_counted': True,
            }

        last = streak_obj.last_streak_date

        if last is None:
            # First ever activity
            user.current_streak = 1
        elif last == today_streak - timedelta(days=1):
            # Consecutive day
            user.current_streak += 1
        else:
            # Gap detected — check if rest days cover it
            gap_start = last + timedelta(days=1)
            gap_end = today_streak - timedelta(days=1)

            if gap_start <= gap_end:
                streak_alive = _check_gap_protected(user, gap_start, gap_end)
                if streak_alive:
                    user.current_streak += 1
                else:
                    user.current_streak = 1
            else:
                user.current_streak = 1

        if user.current_streak > user.longest_streak:
            user.longest_streak = user.current_streak

        streak_obj.last_streak_date = today_streak
        streak_obj.last_workout_date = today_streak
        streak_obj.last_activity_type = activity_type
        streak_obj.save(update_fields=[
            'last_streak_date', 'last_workout_date', 'last_activity_type', 'updated_at'
        ])
        user.save(update_fields=['current_streak', 'longest_streak'])

    return {
        'current_streak': user.current_streak,
        'already_counted': False,
    }


def _check_gap_protected(user, gap_start, gap_end):
    """
    Check if every day in the gap [gap_start, gap_end] is covered
    by a rest day within the weekly budget.
    """
    current = gap_start
    while current <= gap_end:
        rest_exists = RestDay.objects.filter(
            user=user, streak_date=current
        ).exists()
        if not rest_exists:
            return False
        # Verify within weekly budget
        if not _rest_day_within_budget(user, current):
            return False
        current += timedelta(days=1)
    return True


def _rest_day_within_budget(user, check_date):
    """
    Check if a rest day on check_date is within the user's weekly budget.
    Budget = 7 - weekly_workout_goal.
    """
    allowed = 7 - user.weekly_workout_goal
    if allowed <= 0:
        return False

    # Get ISO week boundaries
    iso_year, iso_week, _ = check_date.isocalendar()
    week_start = date.fromisocalendar(iso_year, iso_week, 1)
    week_end = week_start + timedelta(days=6)

    rest_count = RestDay.objects.filter(
        user=user,
        streak_date__gte=week_start,
        streak_date__lte=week_end,
    ).count()

    return rest_count <= allowed


def record_rest_day(user):
    """
    Record a rest day for the user.
    Returns dict with success status and info.
    """
    today_streak = get_streak_date(_get_local_now(user))

    # Check if already rested today
    if RestDay.objects.filter(user=user, streak_date=today_streak).exists():
        return {
            'success': False,
            'error': 'You already have a rest day logged for today.',
        }

    # Check if already worked out today
    streak_obj = Streak.objects.filter(user=user).first()
    if streak_obj and streak_obj.last_streak_date == today_streak:
        return {
            'success': False,
            'error': 'You already logged activity today. No need to rest!',
        }

    # Check weekly budget
    allowed = 7 - user.weekly_workout_goal
    info = get_weekly_rest_day_info(user)

    protected = info['rest_days_remaining'] > 0

    # Create the rest day record
    RestDay.objects.create(user=user, streak_date=today_streak)

    if not protected:
        return {
            'success': True,
            'protected': False,
            'message': f'Rest day logged, but you\'ve used all {allowed} rest days this week. This rest day won\'t protect your streak.',
        }

    return {
        'success': True,
        'protected': True,
        'message': f'Rest day logged! You have {info["rest_days_remaining"] - 1} rest days remaining this week.',
    }


def get_weekly_rest_day_info(user):
    """
    Get rest day usage info for the current ISO week.
    """
    today = get_streak_date(_get_local_now(user))
    iso_year, iso_week, _ = today.isocalendar()
    week_start = date.fromisocalendar(iso_year, iso_week, 1)
    week_end = week_start + timedelta(days=6)

    rest_days_used = RestDay.objects.filter(
        user=user,
        streak_date__gte=week_start,
        streak_date__lte=week_end,
    ).count()

    rest_days_allowed = max(0, 7 - user.weekly_workout_goal)
    rest_days_remaining = max(0, rest_days_allowed - rest_days_used)

    return {
        'rest_days_used': rest_days_used,
        'rest_days_allowed': rest_days_allowed,
        'rest_days_remaining': rest_days_remaining,
    }


def get_streak_details(user):
    """
    Get all data needed for the streak details page.
    Performs lazy evaluation to ensure displayed streak is accurate.
    """
    today_streak = get_streak_date(_get_local_now(user))

    streak_obj, _ = Streak.objects.get_or_create(user=user)

    # Lazy evaluate — check if streak should be reset
    _lazy_evaluate_streak(user, streak_obj, today_streak)

    # Check if user has activity today
    has_activity_today = streak_obj.last_streak_date == today_streak

    # Check if user has a rest day today
    has_rest_today = RestDay.objects.filter(
        user=user, streak_date=today_streak
    ).exists()

    # Week starts Sunday — build 7-day window
    from workouts.models import Workout
    from social.models import QuickWorkout
    days_since_sunday = (today_streak.weekday() + 1) % 7
    week_start = today_streak - timedelta(days=days_since_sunday)
    week_end = week_start + timedelta(days=6)

    # Unique dates with at least one workout or check-in (no double-counting)
    workout_dates = set(
        Workout.objects.filter(
            user=user,
            start_time__date__gte=week_start,
            start_time__date__lte=week_end,
        ).values_list('start_time__date', flat=True)
    )
    checkin_dates = set(
        QuickWorkout.objects.filter(
            user=user,
            created_at__date__gte=week_start,
            created_at__date__lte=week_end,
        ).values_list('created_at__date', flat=True)
    )
    active_dates = workout_dates | checkin_dates

    # Rest days used this week
    rest_dates = set(
        RestDay.objects.filter(
            user=user,
            streak_date__gte=week_start,
            streak_date__lte=week_end,
        ).values_list('streak_date', flat=True)
    )

    # Build per-day status list for the 7 bubbles (Sun=0 … Sat=6)
    day_labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    week_days = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        week_days.append({
            'label': day_labels[i],
            'active': day in active_dates,
            'rest': day in rest_dates and day not in active_dates,
            'is_today': day == today_streak,
            'is_future': day > today_streak,
        })

    weekly_active_days = len(active_dates)

    rest_info = get_weekly_rest_day_info(user)

    from workouts.services.achievements_service import get_user_achievements
    achievements = get_user_achievements(user, weekly_active_days, user.weekly_workout_goal)

    return {
        'current_streak': user.current_streak,
        'longest_streak': user.longest_streak,
        'has_activity_today': has_activity_today,
        'has_rest_today': has_rest_today,
        'rest_info': rest_info,
        'weekly_workout_count': weekly_active_days,
        'weekly_workout_goal': user.weekly_workout_goal,
        'week_days': week_days,
        'achievements': achievements,
    }


def _lazy_evaluate_streak(user, streak_obj, today_streak):
    """
    Check if the streak should be reset due to missed days.
    Only checks up to yesterday — user still has today to work out.
    Resets current_streak to 0 if an unprotected gap is found.
    """
    last = streak_obj.last_streak_date
    if last is None:
        return

    yesterday = today_streak - timedelta(days=1)

    # If last activity was today or yesterday, streak is fine
    if last >= yesterday:
        return

    # Check gap from day after last activity to yesterday
    gap_start = last + timedelta(days=1)
    gap_end = yesterday

    if not _check_gap_protected(user, gap_start, gap_end):
        user.current_streak = 0
        user.save(update_fields=['current_streak'])
