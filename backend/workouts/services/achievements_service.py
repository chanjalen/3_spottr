"""Achievements service — dynamically computes earned achievements from existing data.

AchievementStat tracks a per-achievement earned_count (incremented once per user,
on first earn). user_pct = earned_count / total_users * 100.
"""
from django.db.models import Count, F
from django.db.models.functions import TruncDate
from django.db import transaction


# ── Master achievement catalogue (display order) ──────────────────────────────
ACHIEVEMENTS = [
    # Check-in milestones
    {'id': 'first_checkin',  'name': 'First Step',        'emoji': '🎯', 'desc': 'Logged your first check-in',      'rarity': 'common'},
    {'id': 'checkins_10',    'name': 'Getting After It',  'emoji': '💪', 'desc': '10 check-ins and counting',       'rarity': 'common'},
    {'id': 'checkins_25',    'name': 'Committed',         'emoji': '🔒', 'desc': '25 check-ins. No excuses.',       'rarity': 'rare'},
    {'id': 'checkins_50',    'name': 'Half Century',      'emoji': '🏋️', 'desc': '50 check-ins. A real one.',       'rarity': 'epic'},
    {'id': 'checkins_100',   'name': 'Century Club',      'emoji': '💯', 'desc': '100 check-ins. Actual legend.',   'rarity': 'legendary'},

    # Workout logging
    {'id': 'first_workout',  'name': 'Logged In',         'emoji': '📝', 'desc': 'First workout session logged',    'rarity': 'common'},

    # Personal records
    {'id': 'first_pr',       'name': 'New Heights',       'emoji': '📈', 'desc': 'Hit your first personal record', 'rarity': 'common'},
    {'id': 'prs_10',         'name': 'PR Machine',        'emoji': '⚙️',  'desc': '10 personal records smashed',    'rarity': 'rare'},

    # Streak milestones — use longest_streak so they persist after breaks
    {'id': 'streak_7',       'name': 'Week Warrior',      'emoji': '⚡', 'desc': '7-day streak achieved',          'rarity': 'common'},
    {'id': 'streak_30',      'name': 'On Fire',           'emoji': '🔥', 'desc': '30-day streak. Unstoppable.',    'rarity': 'rare'},
    {'id': 'streak_100',     'name': 'Centurion',         'emoji': '💎', 'desc': '100-day streak. Elite status.',  'rarity': 'epic'},
    {'id': 'streak_365',     'name': 'Year of the Grind', 'emoji': '👑', 'desc': '365 days straight. A legend.',  'rarity': 'legendary'},

    # Activity type
    {'id': 'runner',         'name': 'Road Runner',       'emoji': '🏃', 'desc': '5+ running workouts logged',     'rarity': 'rare'},

    # Weekly goal
    {'id': 'overachiever',   'name': 'Overachiever',      'emoji': '🌟', 'desc': 'Crushed your weekly goal',       'rarity': 'rare'},

    # Rest days
    {'id': 'first_rest_day', 'name': 'Rest is Valid',     'emoji': '😴', 'desc': 'Took your first rest day',       'rarity': 'common'},
    {'id': 'rest_veteran',   'name': 'Recovery Expert',   'emoji': '🧘', 'desc': '10 rest days. True balance.',    'rarity': 'rare'},

    # Funny / easter eggs
    {'id': 'triple_checkin', 'name': 'Bro. Sit Down.',    'emoji': '😅', 'desc': '3 check-ins in one day???',      'rarity': 'epic'},
    {'id': 'night_owl',      'name': 'Night Owl',         'emoji': '🦉', 'desc': 'Checking in after midnight smh', 'rarity': 'rare'},
    {'id': 'no_rest_streak', 'name': 'No Days Off',       'emoji': '🦾', 'desc': '30-day streak with zero rest',   'rarity': 'epic'},
]


_RARITY_ORDER = {'legendary': 0, 'epic': 1, 'rare': 2, 'common': 3}


def get_user_achievements(user, weekly_workout_count: int, weekly_workout_goal: int) -> list:
    """Return ALL achievements with an `earned` boolean on each.

    Sorted: earned first (highest rarity first), then locked (highest rarity first).
    """
    from social.models import QuickWorkout
    from workouts.models import Workout, RestDay

    try:
        from workouts.models import PersonalRecord
        pr_count = PersonalRecord.objects.filter(user=user).count()
    except Exception:
        pr_count = 0

    checkin_count = QuickWorkout.objects.filter(user=user).count()
    workout_count = Workout.objects.filter(user=user).count()
    rest_day_count = RestDay.objects.filter(user=user).count()
    run_count = Workout.objects.filter(user=user, type__icontains='run').count()
    longest_streak = user.longest_streak

    # 3 or more check-ins on the same calendar day
    triple_checkin = (
        QuickWorkout.objects
        .filter(user=user)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(cnt=Count('id'))
        .filter(cnt__gte=3)
        .exists()
    )

    # Late-night check-in (UTC hour 0–2; good-enough proxy for the 3 AM rule)
    night_owl = QuickWorkout.objects.filter(user=user, created_at__hour__lt=3).exists()

    # ── Evaluate ─────────────────────────────────────────────────────────────
    earned = set()

    if checkin_count >= 1:   earned.add('first_checkin')
    if checkin_count >= 10:  earned.add('checkins_10')
    if checkin_count >= 25:  earned.add('checkins_25')
    if checkin_count >= 50:  earned.add('checkins_50')
    if checkin_count >= 100: earned.add('checkins_100')

    if workout_count >= 1:   earned.add('first_workout')

    if pr_count >= 1:        earned.add('first_pr')
    if pr_count >= 10:       earned.add('prs_10')

    if longest_streak >= 7:   earned.add('streak_7')
    if longest_streak >= 30:  earned.add('streak_30')
    if longest_streak >= 100: earned.add('streak_100')
    if longest_streak >= 365: earned.add('streak_365')

    if run_count >= 5:       earned.add('runner')

    if weekly_workout_goal > 0 and weekly_workout_count > weekly_workout_goal:
        earned.add('overachiever')

    if rest_day_count >= 1:  earned.add('first_rest_day')
    if rest_day_count >= 10: earned.add('rest_veteran')

    if triple_checkin:       earned.add('triple_checkin')
    if night_owl:            earned.add('night_owl')
    if longest_streak >= 30 and rest_day_count == 0:
        earned.add('no_rest_streak')

    # ── Track newly earned achievements & update global counts ────────────────
    from workouts.models import AchievementStat, UserAchievement
    from accounts.models import User

    existing_ids = set(
        UserAchievement.objects.filter(user=user).values_list('achievement_id', flat=True)
    )
    newly_earned = earned - existing_ids

    if newly_earned:
        with transaction.atomic():
            # Record each new unlock (ignore_conflicts handles any race)
            UserAchievement.objects.bulk_create(
                [UserAchievement(user=user, achievement_id=aid) for aid in newly_earned],
                ignore_conflicts=True,
            )
            # Atomically increment the global counter for each newly earned achievement
            for aid in newly_earned:
                AchievementStat.objects.get_or_create(achievement_id=aid)
                AchievementStat.objects.filter(achievement_id=aid).update(
                    earned_count=F('earned_count') + 1
                )

    # ── Compute user_pct for every achievement ────────────────────────────────
    # Both values change rarely, so we cache them for 5 minutes.
    # This means a single DB hit serves all users during that window instead of
    # one COUNT + one 20-row SELECT per streak page load per user.
    from django.core.cache import cache

    total_users = cache.get('achievement_total_users')
    if total_users is None:
        total_users = max(User.objects.count(), 1)
        cache.set('achievement_total_users', total_users, 300)

    stat_map = cache.get('achievement_stat_map')
    if stat_map is None:
        stat_map = {
            s.achievement_id: s.earned_count
            for s in AchievementStat.objects.all()
        }
        cache.set('achievement_stat_map', stat_map, 300)

    # If we just wrote new achievement stats, invalidate so the next reader
    # picks up fresh counts within 300 s anyway (TTL handles it automatically).
    if newly_earned:
        cache.delete('achievement_stat_map')
        cache.delete('achievement_total_users')

    result = []
    for a in ACHIEVEMENTS:
        count = stat_map.get(a['id'], 0)
        pct = round(count / total_users * 100, 1)
        result.append({**a, 'earned': a['id'] in earned, 'user_pct': pct})

    # Earned first (highest rarity first), then locked (highest rarity first)
    result.sort(key=lambda a: (0 if a['earned'] else 1, _RARITY_ORDER[a['rarity']]))
    return result
