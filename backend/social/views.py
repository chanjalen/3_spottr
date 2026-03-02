import base64
import json
import logging
import os
import uuid
from collections import defaultdict
from datetime import timedelta, date, datetime

logger = logging.getLogger(__name__)

from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db.models import F, Q, Max, Subquery, OuterRef, Exists, Count, Value, CharField, IntegerField

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response as DRFResponse

from .models import QuickWorkout, Post, Comment, Reaction, Poll, PollOption, PollVote, Follow
from media.models import MediaLink
from media.utils import create_media_asset, get_media_url, build_media_url
from gyms.models import Gym
from workouts.models import PersonalRecord
from messaging.models import Message, MessageRead
from messaging.services import send_dm, send_group_message
from messaging.exceptions import NotMutualFollowError, UserBlockedError, NotGroupMemberError, PostNotFoundError
from groups.models import Group, GroupMember
from django.utils import timezone

FEED_PAGE_SIZE = 5
FEED_CACHE_TTL = 60


@login_required
def social_view(request):
    """
    Display the social page with DM conversations and group conversations.
    """
    user = request.user

    # === DM CONVERSATIONS ===
    # Get latest message per conversation partner
    dm_conversations = []
    # Get all DM partners (users I've sent to or received from)
    sent_partners = Message.objects.filter(
        sender=user, recipient__isnull=False
    ).values_list('recipient_id', flat=True).distinct()
    received_partners = Message.objects.filter(
        recipient=user
    ).values_list('sender_id', flat=True).distinct()
    partner_ids = set(list(sent_partners) + list(received_partners))

    from accounts.models import User as UserModel
    for partner_id in partner_ids:
        partner = UserModel.objects.filter(id=partner_id).first()
        if not partner:
            continue

        # Get last message between me and this partner
        last_msg = Message.objects.filter(
            Q(sender=user, recipient=partner) |
            Q(sender=partner, recipient=user)
        ).order_by('-created_at').first()

        if not last_msg:
            continue

        # Count unread messages from this partner
        unread_count = Message.objects.filter(
            sender=partner, recipient=user
        ).exclude(
            read_receipts__user=user
        ).count()

        from workouts.services.streak_service import get_streak_date
        from workouts.models import Streak, RestDay
        today_streak = get_streak_date()
        streak_obj = Streak.objects.filter(user=partner).first()
        partner_checked_in = (
            (streak_obj is not None and streak_obj.last_streak_date == today_streak)
            or RestDay.objects.filter(user=partner, streak_date=today_streak).exists()
        )

        dm_conversations.append({
            'partner': partner,
            'last_message': last_msg.content[:80],
            'last_message_time': last_msg.created_at,
            'time_ago': get_time_ago(last_msg.created_at),
            'unread_count': unread_count,
            'is_zap': last_msg.content == 'ZAP',
            'partner_checked_in': partner_checked_in,
        })

    # Sort DM conversations by last message time
    dm_conversations.sort(key=lambda x: x['last_message_time'], reverse=True)

    # === GROUP CONVERSATIONS ===
    group_conversations = []
    my_groups = GroupMember.objects.filter(user=user).select_related('group')

    for membership in my_groups:
        group = membership.group
        member_count = GroupMember.objects.filter(group=group).count()

        # Get last message in this group
        last_msg = Message.objects.filter(group=group).order_by('-created_at').first()

        # Count unread group messages
        unread_count = 0
        if last_msg:
            unread_count = Message.objects.filter(
                group=group
            ).exclude(
                sender=user
            ).exclude(
                read_receipts__user=user
            ).count()

        group_conversations.append({
            'group': group,
            'member_count': member_count,
            'role': membership.role,
            'last_message': last_msg.content[:80] if last_msg else None,
            'last_message_sender': (last_msg.sender.display_name if last_msg and last_msg.sender else None),
            'last_message_time': last_msg.created_at if last_msg else group.created_at,
            'time_ago': get_time_ago(last_msg.created_at) if last_msg else '',
            'unread_count': unread_count,
        })

    # Sort group conversations by last message time
    group_conversations.sort(key=lambda x: x['last_message_time'], reverse=True)

    # === MY GROUPS (for create/join modal) ===
    # Search results for public groups I'm not in
    my_group_ids = my_groups.values_list('group_id', flat=True)
    public_groups = Group.objects.filter(
        privacy='public'
    ).exclude(
        id__in=my_group_ids
    ).annotate(
        member_count=Count('members')
    ).order_by('-created_at')[:20]

    # Total unread count
    total_unread = sum(c['unread_count'] for c in dm_conversations) + \
                   sum(c['unread_count'] for c in group_conversations)

    # === FRIENDS (mutual follows) for new chat modal ===
    my_following_ids = Follow.objects.filter(follower=user).values_list('following_id', flat=True)
    my_follower_ids = Follow.objects.filter(following=user).values_list('follower_id', flat=True)
    friends = UserModel.objects.filter(
        id__in=my_following_ids
    ).filter(
        id__in=my_follower_ids
    ).order_by('display_name')

    return render(request, 'social/social.html', {
        'dm_conversations': dm_conversations,
        'group_conversations': group_conversations,
        'public_groups': public_groups,
        'total_unread': total_unread,
        'friends': friends,
    })


def _encode_cursor(created_at, item_id):
    """Encode a cursor as base64 'iso_timestamp|id'."""
    raw = f"{created_at.isoformat()}|{item_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor_str):
    """Decode a cursor. Returns (datetime, id_str) or None."""
    try:
        raw = base64.urlsafe_b64decode(cursor_str.encode()).decode()
        ts, item_id = raw.split('|', 1)
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = timezone.make_aware(dt)
        return dt, item_id
    except Exception:
        return None


def _serialize_user(user):
    """Convert User model instance to a plain dict for templates/JSON."""
    return {
        'id': str(user.id),
        'username': user.username,
        'display_name': user.display_name or user.username,
        'avatar_url': user.avatar_url or None,
        'streak': getattr(user, 'current_streak', 0),
    }


def _bulk_media_urls(destination_type, entity_ids):
    """Single query to get photo URLs for a batch of entities.
    Returns dict mapping entity_id -> URL."""
    if not entity_ids:
        return {}
    links = MediaLink.objects.filter(
        destination_type=destination_type,
        destination_id__in=[str(eid) for eid in entity_ids],
        type='inline',
    ).select_related('asset')
    result = {}
    for link in links:
        if link.destination_id not in result:
            result[link.destination_id] = build_media_url(link.asset.storage_key)
    return result


def _format_duration(duration):
    """Format a timedelta duration to a human-readable string."""
    if not duration:
        return "--"
    total_seconds = int(duration.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _get_feed_page(request, tab, cursor=None, tag=None):
    """
    Core feed function: returns (feed_items, next_cursor).
    Uses annotated queries to eliminate N+1 problems.
    """
    user = request.user if request.user.is_authenticated else None

    # ── Feed split logic ─────────────────────────────────────────────────────
    # Friends/Groups tab → check-ins (QuickWorkout) only.
    #   Visible authors: people you follow + members of any group you belong to
    #   (excluding org groups, which live in a separate model) + yourself.
    # Main tab           → public posts (visibility='main') from everyone.
    #                      friends-only posts are NOT shown here.
    # ─────────────────────────────────────────────────────────────────────────
    if tab == 'friends' and user:
        from groups.models import GroupMember
        following_ids = set(Follow.objects.filter(follower=user).values_list('following_id', flat=True))
        my_group_ids = GroupMember.objects.filter(user=user).values_list('group_id', flat=True)
        group_peer_ids = set(GroupMember.objects.filter(group_id__in=my_group_ids).values_list('user_id', flat=True))
        visible_user_ids = following_ids | group_peer_ids | {user.id}
        qw_qs = QuickWorkout.objects.filter(user_id__in=visible_user_ids)
        post_qs = Post.objects.none()
    elif tab == 'gym' and user:
        from accounts.models import User as AccUser
        my_gym_ids = list(user.enrolled_gyms.values_list('id', flat=True))
        gym_user_ids = set(AccUser.objects.filter(enrolled_gyms__id__in=my_gym_ids).values_list('id', flat=True))
        visible_user_ids = gym_user_ids | {user.id}
        qw_qs = QuickWorkout.objects.filter(user_id__in=visible_user_ids)
        post_qs = Post.objects.none()
    elif tab == 'org' and user:
        from organizations.models import OrgMember
        my_org_ids = list(OrgMember.objects.filter(user=user).values_list('org_id', flat=True))
        org_user_ids = set(OrgMember.objects.filter(org_id__in=my_org_ids).values_list('user_id', flat=True))
        visible_user_ids = org_user_ids | {user.id}
        qw_qs = QuickWorkout.objects.filter(user_id__in=visible_user_ids)
        post_qs = Post.objects.none()
    else:
        # Main tab: only truly public posts — no follower-gated content here.
        qw_qs = QuickWorkout.objects.none()
        post_qs = Post.objects.filter(visibility='main')

    # Filter by hashtag if tag is provided
    if tag:
        tag_filter = f'#{tag}'
        if not qw_qs.query.is_empty():
            qw_qs = qw_qs.filter(description__icontains=tag_filter)
        if not post_qs.query.is_empty():
            post_qs = post_qs.filter(description__icontains=tag_filter)

    # Annotate counts using subqueries to avoid JOIN row-multiplication.
    # Count('reactions', distinct=True) does LEFT JOIN + GROUP BY which explodes
    # rows (posts × reactions × comments). Subquery emits a correlated
    # SELECT COUNT(*) per row, using existing indexes with no GROUP BY overhead.
    qw_qs = qw_qs.select_related('user', 'location', 'workout').annotate(
        like_count=Subquery(
            Reaction.objects.filter(quick_workout=OuterRef('pk'))
            .values('quick_workout')
            .annotate(c=Count('id'))
            .values('c'),
            output_field=IntegerField(),
        ),
        comment_count=Subquery(
            Comment.objects.filter(quick_workout=OuterRef('pk'))
            .values('quick_workout')
            .annotate(c=Count('id'))
            .values('c'),
            output_field=IntegerField(),
        ),
    )
    post_qs = post_qs.select_related('user', 'location', 'workout').annotate(
        like_count=Subquery(
            Reaction.objects.filter(post=OuterRef('pk'))
            .values('post')
            .annotate(c=Count('id'))
            .values('c'),
            output_field=IntegerField(),
        ),
        comment_count=Subquery(
            Comment.objects.filter(post=OuterRef('pk'))
            .values('post')
            .annotate(c=Count('id'))
            .values('c'),
            output_field=IntegerField(),
        ),
    )

    if user:
        qw_qs = qw_qs.annotate(
            user_liked=Exists(Reaction.objects.filter(quick_workout=OuterRef('pk'), user=user)),
        )
        post_qs = post_qs.annotate(
            user_liked=Exists(Reaction.objects.filter(post=OuterRef('pk'), user=user)),
        )
    else:
        qw_qs = qw_qs.annotate(
            user_liked=Value(False, output_field=CharField()),
        )
        post_qs = post_qs.annotate(
            user_liked=Value(False, output_field=CharField()),
        )

    # Apply cursor filter
    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded:
            cursor_dt, cursor_id = decoded
            cursor_filter = Q(created_at__lt=cursor_dt) | Q(created_at=cursor_dt, id__lt=cursor_id)
            qw_qs = qw_qs.filter(cursor_filter)
            post_qs = post_qs.filter(cursor_filter)

    # Fetch page_size + 1 from each, merge, take page_size + 1
    limit = FEED_PAGE_SIZE + 1
    qw_list = list(qw_qs.order_by('-created_at', '-id')[:limit])
    post_list = list(post_qs.order_by('-created_at', '-id')[:limit])

    # Merge into unified list sorted by created_at desc
    raw_items = []
    for qw in qw_list:
        raw_items.append(('checkin', qw.created_at, qw.id, qw))
    for p in post_list:
        raw_items.append(('post', p.created_at, p.id, p))
    raw_items.sort(key=lambda x: (x[1], x[2]), reverse=True)
    raw_items = raw_items[:limit]

    # Determine next_cursor
    has_more = len(raw_items) > FEED_PAGE_SIZE
    if has_more:
        raw_items = raw_items[:FEED_PAGE_SIZE]

    if has_more and raw_items:
        last = raw_items[-1]
        next_cursor = _encode_cursor(last[1], last[2])
    else:
        next_cursor = None

    # Collect IDs for bulk fetches
    checkin_ids = [item[2] for item in raw_items if item[0] == 'checkin']
    post_ids = [item[2] for item in raw_items if item[0] == 'post']
    post_objs = {item[2]: item[3] for item in raw_items if item[0] == 'post'}

    # Bulk fetch media URLs (1-2 queries instead of N)
    checkin_photos = _bulk_media_urls('quick_workout', checkin_ids)
    post_photos = _bulk_media_urls('post', post_ids)

    # Bulk fetch polls for posts (with prefetched options)
    polls_by_post = {}
    if post_ids:
        polls = Poll.objects.filter(post_id__in=post_ids).prefetch_related('options')
        for poll in polls:
            polls_by_post[poll.post_id] = poll

    # Bulk fetch user's poll votes
    user_poll_votes = {}
    if user and polls_by_post:
        poll_ids_list = [p.id for p in polls_by_post.values()]
        votes = PollVote.objects.filter(poll_id__in=poll_ids_list, user=user).select_related('option')
        for v in votes:
            user_poll_votes[v.poll_id] = v

    # Bulk fetch personal records for posts
    prs_by_post = {}
    if post_ids:
        prs = PersonalRecord.objects.filter(post_id__in=post_ids)
        for pr in prs:
            prs_by_post[pr.post_id] = pr

    # Bulk fetch workout details for workout posts AND checkins with attached workouts
    from workouts.models import Exercise, ExerciseSet
    checkin_objs = {item[2]: item[3] for item in raw_items if item[0] == 'checkin'}
    post_workout_ids = [obj.workout_id for obj in post_objs.values() if obj.workout_id]
    checkin_workout_ids = [obj.workout_id for obj in checkin_objs.values() if obj.workout_id]
    all_workout_ids = list(set(post_workout_ids + checkin_workout_ids))
    exercise_counts = {}
    set_counts = {}
    exercise_summaries = {}  # workout_id -> [{'name': ..., 'sets': ...}, ...]
    if all_workout_ids:
        from django.db.models import Count as DjCount
        ex_counts = Exercise.objects.filter(workout_id__in=all_workout_ids).values('workout_id').annotate(cnt=DjCount('id'))
        for row in ex_counts:
            exercise_counts[row['workout_id']] = row['cnt']
        s_counts = ExerciseSet.objects.filter(exercise__workout_id__in=all_workout_ids).values('exercise__workout_id').annotate(cnt=DjCount('id'))
        for row in s_counts:
            set_counts[row['exercise__workout_id']] = row['cnt']
        # First 3 exercises per workout with their set count
        exercises = Exercise.objects.filter(workout_id__in=all_workout_ids).order_by('workout_id', 'order')
        summaries_by_wk = defaultdict(list)
        for ex in exercises:
            if len(summaries_by_wk[ex.workout_id]) < 3:
                summaries_by_wk[ex.workout_id].append({'name': ex.name, 'sets': ex.sets})
        exercise_summaries = dict(summaries_by_wk)

    # Compute shared context tags for gym/org tabs (which gym/org each poster shares with viewer)
    shared_context_by_user = {}  # user_id -> [name, ...]
    if tab == 'gym' and user and checkin_objs:
        my_gym_map = {g.id: g.name for g in user.enrolled_gyms.all()}
        if my_gym_map:
            poster_ids = list({obj.user_id for obj in checkin_objs.values()})
            from accounts.models import User as AccUser
            for u in AccUser.objects.filter(id__in=poster_ids).prefetch_related('enrolled_gyms').only('id'):
                shared = [my_gym_map[g.id] for g in u.enrolled_gyms.all() if g.id in my_gym_map]
                if shared:
                    shared_context_by_user[u.id] = shared
    elif tab == 'org' and user and checkin_objs:
        from organizations.models import OrgMember
        my_org_ids = set(OrgMember.objects.filter(user=user).values_list('org_id', flat=True))
        if my_org_ids:
            poster_ids = list({obj.user_id for obj in checkin_objs.values()})
            org_qs = OrgMember.objects.filter(user_id__in=poster_ids, org_id__in=my_org_ids).select_related('org')
            from collections import defaultdict as _dd
            _orgs_by_user = _dd(list)
            for m in org_qs:
                _orgs_by_user[m.user_id].append(m.org.name)
            shared_context_by_user = dict(_orgs_by_user)

    # Build feed items
    feed_items = []
    for item_type, created_at, item_id, obj in raw_items:
        if item_type == 'checkin':
            photo_url = checkin_photos.get(str(item_id))
            # Fallback for legacy uploads
            if not photo_url:
                path = f'checkins/{item_id}.jpg'
                try:
                    if default_storage.exists(path):
                        photo_url = build_media_url(path)
                except Exception:
                    pass
            checkin_workout = obj.workout if obj.workout_id and obj.workout else None
            feed_items.append({
                'type': 'checkin',
                'id': str(item_id),
                'user': obj.user,
                'location': obj.location,
                'location_name': obj.location_name or (obj.location.name if obj.location else ''),
                'workout_type': obj.type.replace('_', ' ').title() if obj.type else '',
                'description': obj.description,
                'created_at': created_at,
                'photo_url': photo_url,
                'like_count': obj.like_count,
                'comment_count': obj.comment_count,
                'user_liked': bool(obj.user_liked) if user else False,
                'shared_context': shared_context_by_user.get(obj.user_id, []),
                'workout': {
                    'id': str(checkin_workout.id),
                    'name': checkin_workout.name,
                    'duration': _format_duration(checkin_workout.duration),
                    'exercise_count': exercise_counts.get(checkin_workout.id, 0),
                    'total_sets': set_counts.get(checkin_workout.id, 0),
                    'exercises': exercise_summaries.get(checkin_workout.id, []),
                } if checkin_workout else None,
            })
        else:
            post = obj
            photo_url = post_photos.get(str(item_id)) or (build_media_url(post.photo.name) if post.photo else None)
            post_data = {
                'type': 'workout' if post.workout_id else 'post',
                'id': str(item_id),
                'user': post.user,
                'location': post.location,
                'description': post.description,
                'created_at': created_at,
                'photo_url': photo_url,
                'video_url': build_media_url(post.video.name) if post.video else None,
                'link_url': post.link_url,
                'like_count': post.like_count,
                'comment_count': post.comment_count,
                'user_liked': bool(post.user_liked) if user else False,
            }

            # Poll
            poll = polls_by_post.get(item_id)
            if poll:
                vote = user_poll_votes.get(poll.id)
                user_voted = vote is not None
                user_vote_option = str(vote.option_id) if vote else None
                total_votes = sum(opt.votes for opt in poll.options.all())
                poll_options = []
                for opt in poll.options.all().order_by('order'):
                    percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
                    poll_options.append({
                        'id': str(opt.id),
                        'text': opt.text,
                        'votes': opt.votes,
                        'order': opt.order,
                        'percentage': percentage,
                    })
                post_data['poll'] = {
                    'id': str(poll.id),
                    'question': poll.question,
                    'options': poll_options,
                    'total_votes': total_votes,
                    'is_active': poll.is_active,
                    'user_voted': user_voted,
                    'user_vote_option': user_vote_option,
                }
            else:
                post_data['poll'] = None

            # Workout details
            if post.workout_id and post.workout:
                workout = post.workout
                post_data['workout'] = {
                    'id': str(workout.id),
                    'name': workout.name,
                    'duration': _format_duration(workout.duration),
                    'exercise_count': exercise_counts.get(workout.id, 0),
                    'total_sets': set_counts.get(workout.id, 0),
                    'exercises': exercise_summaries.get(workout.id, []),
                }

            # Personal record
            pr = prs_by_post.get(item_id)
            if pr:
                post_data['personal_record'] = {
                    'id': str(pr.id),
                    'exercise_name': pr.exercise_name,
                    'value': pr.value,
                    'unit': pr.unit,
                }

            feed_items.append(post_data)

    return feed_items, next_cursor


def _serialize_feed_items_for_json(feed_items):
    """Convert feed items with User objects to JSON-serializable dicts."""
    result = []
    for item in feed_items:
        item_copy = dict(item)
        # Serialize user object
        if hasattr(item_copy.get('user'), 'username'):
            item_copy['user'] = _serialize_user(item_copy['user'])
        # Serialize created_at to ISO string
        if hasattr(item_copy.get('created_at'), 'isoformat'):
            item_copy['time_ago'] = get_time_ago(item_copy['created_at'])
            item_copy['created_at'] = item_copy['created_at'].isoformat()
        # Serialize location
        loc = item_copy.get('location')
        if loc and hasattr(loc, 'name'):
            item_copy['location'] = {'name': loc.name, 'id': str(loc.id)}
        elif loc is None:
            item_copy['location'] = None
        result.append(item_copy)
    return result


def feed_view(request):
    """
    Display the main feed with all posts and quick workouts.
    Supports ?tab=main (default) and ?tab=friends.
    AJAX requests (with cursor param or XMLHttpRequest) return JSON for infinite scroll.
    """
    tab = request.GET.get('tab', 'main')
    if tab not in ('main', 'friends', 'gym', 'org'):
        tab = 'main'

    tag = request.GET.get('tag', '').strip()

    cursor = request.GET.get('cursor', None)
    is_ajax = (
        request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        or cursor
        or request.headers.get('Authorization', '').startswith('Token ')
    )

    if is_ajax:
        feed_items, next_cursor = _get_feed_page(request, tab, cursor, tag=tag or None)
        items_json = _serialize_feed_items_for_json(feed_items)
        return JsonResponse({'items': items_json, 'next_cursor': next_cursor})

    # Server-rendered first page with caching
    user = request.user if request.user.is_authenticated else None
    # Skip cache when filtering by tag
    cache_key = None
    if not tag:
        cache_key = f'feed:{user.id if user else "anon"}:{tab}:page1' if user else None

    feed_items = None
    next_cursor = None

    if cache_key:
        cached = cache.get(cache_key)
        if cached:
            feed_items, next_cursor = cached

    if feed_items is None:
        feed_items, next_cursor = _get_feed_page(request, tab, tag=tag or None)
        if cache_key:
            cache.set(cache_key, (feed_items, next_cursor), FEED_CACHE_TTL)

    return render(request, 'social/feed.html', {
        'feed_items': feed_items,
        'active_tab': tab,
        'active_tag': tag,
        'next_cursor': next_cursor or '',
    })


def post_detail_view(request, post_id):
    """Display a single post with full details."""
    post = get_object_or_404(Post, id=post_id)

    like_count = Reaction.objects.filter(post=post).count()
    comment_count = Comment.objects.filter(post=post).count()
    user_liked = False
    if request.user.is_authenticated:
        user_liked = Reaction.objects.filter(post=post, user=request.user).exists()

    item = {
        'type': 'workout' if post.workout else 'post',
        'id': str(post.id),
        'user': post.user,
        'location': post.location,
        'description': post.description,
        'created_at': post.created_at,
        'photo_url': get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None),
        'video_url': build_media_url(post.video.name) if post.video else None,
        'link_url': post.link_url,
        'like_count': like_count,
        'comment_count': comment_count,
        'user_liked': user_liked,
    }

    # Workout details
    if post.workout:
        workout = post.workout
        from workouts.models import Exercise, ExerciseSet
        exercises = Exercise.objects.filter(workout=workout)
        exercise_count = exercises.count()
        total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

        if workout.duration:
            total_seconds = int(workout.duration.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
        else:
            duration_str = "--"

        item['workout'] = {
            'id': str(workout.id),
            'name': workout.name,
            'duration': duration_str,
            'exercise_count': exercise_count,
            'total_sets': total_sets,
            'exercises': [e.name for e in exercises[:3]],
        }

    # Personal record
    pr = PersonalRecord.objects.filter(post=post).first()
    if pr:
        item['personal_record'] = {
            'id': str(pr.id),
            'exercise_name': pr.exercise_name,
            'value': pr.value,
            'unit': pr.unit,
        }

    # Poll
    try:
        poll = post.poll
        user_voted = False
        user_vote_option = None
        if request.user.is_authenticated:
            vote = PollVote.objects.filter(poll=poll, user=request.user).first()
            if vote:
                user_voted = True
                user_vote_option = str(vote.option.id)
        total_votes = poll.get_total_votes()
        poll_options = []
        for opt in poll.options.all().order_by('order'):
            percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
            poll_options.append({
                'id': str(opt.id),
                'text': opt.text,
                'votes': opt.votes,
                'order': opt.order,
                'percentage': percentage,
            })
        item['poll'] = {
            'id': str(poll.id),
            'question': poll.question,
            'options': poll_options,
            'total_votes': total_votes,
            'is_active': poll.is_active,
            'user_voted': user_voted,
            'user_vote_option': user_vote_option,
        }
    except Poll.DoesNotExist:
        item['poll'] = None

    return render(request, 'social/post_detail.html', {'item': item})


def checkin_detail_view(request, checkin_id):
    """Display a single check-in with full details."""
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    like_count = Reaction.objects.filter(quick_workout=checkin).count()
    comment_count = Comment.objects.filter(quick_workout=checkin).count()
    user_liked = False
    if request.user.is_authenticated:
        user_liked = Reaction.objects.filter(quick_workout=checkin, user=request.user).exists()

    item = {
        'type': 'checkin',
        'id': str(checkin.id),
        'user': checkin.user,
        'location': checkin.location,
        'location_name': checkin.location_name or (checkin.location.name if checkin.location else ''),
        'workout_type': checkin.type.replace('_', ' ').title() if checkin.type else '',
        'description': checkin.description,
        'created_at': checkin.created_at,
        'photo_url': get_checkin_photo(checkin.id),
        'like_count': like_count,
        'comment_count': comment_count,
        'user_liked': user_liked,
    }

    return render(request, 'social/post_detail.html', {'item': item})


def get_checkin_photo(checkin_id):
    """
    Get the photo URL for a check-in if it exists.
    """
    url = get_media_url('quick_workout', str(checkin_id))
    if url:
        return url
    # Fallback for legacy uploads without MediaAsset rows
    path = f'checkins/{checkin_id}.jpg'
    try:
        if default_storage.exists(path):
            return build_media_url(path)
    except Exception:
        pass
    return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_checkin_view(request):
    """
    Create a new quick check-in post. Supports token auth for mobile.
    Accepts multipart/form-data (with optional photo file) or JSON.
    Check-ins always go to the Friends/Groups feed.
    """
    try:
        data = request.data
        gym_id = data.get('gym') or data.get('gym_id')
        activity = (data.get('activity') or '').strip() or 'general'
        photo = request.FILES.get('photo')
        workout_id = data.get('workout_id')

        # Require either a gym FK or a typed location name
        location_name_raw = (data.get('location_name') or '').strip()
        gym = None
        if gym_id:
            try:
                gym = Gym.objects.get(id=gym_id)
                location_name = gym.name
            except Gym.DoesNotExist:
                return DRFResponse({'success': False, 'error': 'Gym not found.'}, status=400)
        elif location_name_raw:
            location_name = location_name_raw
        else:
            return DRFResponse(
                {'success': False, 'error': 'A gym or location name is required.'},
                status=400,
            )

        description = (data.get('description') or '').strip() or f'{activity.replace("_", " ").title()} workout'

        # Resolve optional linked logged workout
        linked_workout = None
        if workout_id:
            from workouts.models import Workout
            try:
                linked_workout = Workout.objects.get(id=workout_id, user=request.user)
            except Workout.DoesNotExist:
                pass  # Non-fatal — post without attachment

        checkin = QuickWorkout.objects.create(
            user=request.user,
            location=gym,
            location_name=location_name,
            type=activity,
            description=description,
            workout=linked_workout,
            audience=['friends'],
        )

        # Increment total workouts
        request.user.total_workouts = F('total_workouts') + 1
        request.user.save(update_fields=['total_workouts'])

        # Update streak
        from workouts.services.streak_service import update_streak
        from groups.services import update_group_streaks_for_user
        request.user.refresh_from_db()
        update_streak(request.user, activity_type='checkin')
        update_group_streaks_for_user(request.user)

        # Save the photo if provided
        if photo:
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                path = f'checkins/{checkin.id}.jpg'
                asset = create_media_asset(request.user, photo, path, 'image')
                MediaLink.objects.create(
                    asset=asset,
                    destination_type='quick_workout',
                    destination_id=str(checkin.id),
                    type='inline',
                )
            except DjangoValidationError as e:
                return DRFResponse({'success': False, 'error': e.message}, status=400)

        return DRFResponse({
            'success': True,
            'checkin_id': str(checkin.id),
            'message': 'Check-in posted successfully!'
        })

    except Exception:
        logger.exception("Unexpected error in create_checkin_view")
        return DRFResponse({
            'success': False,
            'error': 'An unexpected error occurred. Please try again.'
        }, status=500)


def get_user_posts(user, viewer=None, thumbnail=False):
    """
    Get all posts (not check-ins) for a user.
    viewer is the logged-in user (for user_liked checks).
    thumbnail=True skips expensive per-item COUNT queries — returns minimal
    data needed to render grid thumbnails immediately (Phase 1).
    """
    posts = Post.objects.filter(
        user=user
    ).select_related('location', 'workout').order_by('-created_at')

    user_posts = []

    for post in posts:
        if thumbnail:
            like_count, comment_count, user_liked = 0, 0, False
        else:
            like_count = Reaction.objects.filter(post=post).count()
            comment_count = Comment.objects.filter(post=post).count()
            user_liked = False
            if viewer and viewer.is_authenticated:
                user_liked = Reaction.objects.filter(post=post, user=viewer).exists()

        post_data = {
            'type': 'workout' if post.workout else 'post',
            'id': post.id,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
            'photo_url': get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None),
            'video_url': build_media_url(post.video.name) if post.video else None,
            'like_count': like_count,
            'comment_count': comment_count,
            'user_liked': user_liked,
        }

        # Add workout details if this is a workout post
        if post.workout:
            workout = post.workout
            if thumbnail:
                exercise_count, total_sets = 0, 0
            else:
                from workouts.models import Exercise, ExerciseSet
                exercise_count = Exercise.objects.filter(workout=workout).count()
                total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

            post_data['workout'] = {
                'id': str(workout.id),
                'name': workout.name,
                'exercise_count': exercise_count,
                'total_sets': total_sets,
            }

        user_posts.append(post_data)

    user_posts.sort(key=lambda x: x['created_at'], reverse=True)

    return user_posts


@login_required
@require_POST
def toggle_like_post_view(request, post_id):
    """
    Toggle like on a post. One like per user per post.
    """
    post = get_object_or_404(Post, id=post_id)

    # Check if user already liked this post
    existing_reaction = Reaction.objects.filter(
        post=post,
        user=request.user
    ).first()

    if existing_reaction:
        # Unlike - remove the reaction
        existing_reaction.delete()
        liked = False
    else:
        # Like - create a reaction
        Reaction.objects.create(
            post=post,
            user=request.user,
            type='like'
        )
        liked = True
        from notifications.dispatcher import notify_like_post
        notify_like_post(request.user, post)

    # Get updated like count
    like_count = Reaction.objects.filter(post=post).count()

    return JsonResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@login_required
@require_POST
def toggle_like_checkin_view(request, checkin_id):
    """
    Toggle like on a quick workout (check-in). One like per user.
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    # Check if user already liked this checkin
    existing_reaction = Reaction.objects.filter(
        quick_workout=checkin,
        user=request.user
    ).first()

    if existing_reaction:
        existing_reaction.delete()
        liked = False
    else:
        Reaction.objects.create(
            quick_workout=checkin,
            user=request.user,
            type='like'
        )
        liked = True

    like_count = Reaction.objects.filter(quick_workout=checkin).count()

    return JsonResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@login_required
@require_GET
def post_likers_view(request, post_id):
    """Get list of users who liked a post."""
    post = get_object_or_404(Post, id=post_id)
    reactions = Reaction.objects.filter(post=post).select_related('user').order_by('-created_at')
    likers = []
    for r in reactions:
        likers.append({
            'id': str(r.user.id),
            'username': r.user.username,
            'display_name': r.user.display_name or r.user.username,
            'avatar_url': r.user.avatar_url or None,
        })
    return JsonResponse({'success': True, 'likers': likers})


@login_required
@require_GET
def checkin_likers_view(request, checkin_id):
    """Get list of users who liked a check-in."""
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)
    reactions = Reaction.objects.filter(quick_workout=checkin).select_related('user').order_by('-created_at')
    likers = []
    for r in reactions:
        likers.append({
            'id': str(r.user.id),
            'username': r.user.username,
            'display_name': r.user.display_name or r.user.username,
            'avatar_url': r.user.avatar_url or None,
        })
    return JsonResponse({'success': True, 'likers': likers})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_like_comment_view(request, comment_id):
    """
    Toggle like on a comment. One like per user per comment.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    existing_reaction = Reaction.objects.filter(
        comment=comment,
        user=request.user
    ).first()

    if existing_reaction:
        existing_reaction.delete()
        liked = False
    else:
        Reaction.objects.create(
            comment=comment,
            user=request.user,
            type='like'
        )
        liked = True

    like_count = Reaction.objects.filter(comment=comment).count()

    return DRFResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_comments_view(request, post_id):
    """
    Get all top-level comments for a post (excluding replies).
    """
    post = get_object_or_404(Post, id=post_id)

    # Only get top-level comments (not replies), sorted by likes desc then newest first
    user_liked_sq = Reaction.objects.filter(comment=OuterRef('pk'), user=request.user)
    comments = (
        Comment.objects
        .filter(post=post, parent_comment__isnull=True)
        .select_related('user')
        .annotate(
            reaction_count=Count('reactions'),
            user_liked_ann=Exists(user_liked_sq),
        )
        .order_by('-reaction_count', '-created_at')
    )

    comments_data = [
        {
            'id': str(comment.id),
            'user': {
                'id': str(comment.user.id),
                'display_name': comment.user.display_name,
                'username': comment.user.username,
                'avatar_url': comment.user.avatar_url or None,
            },
            'description': comment.description,
            'created_at': comment.created_at.isoformat(),
            'like_count': comment.reaction_count,
            'user_liked': comment.user_liked_ann,
            'is_owner': comment.user == request.user,
            'reply_count': comment.reply_count,
        }
        for comment in comments
    ]

    return DRFResponse({
        'success': True,
        'comments': comments_data,
        'count': len(comments_data),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_checkin_comments_view(request, checkin_id):
    """
    Get all top-level comments for a check-in (quick workout).
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    # Only get top-level comments (not replies), sorted by likes desc then newest first
    user_liked_sq = Reaction.objects.filter(comment=OuterRef('pk'), user=request.user)
    comments = (
        Comment.objects
        .filter(quick_workout=checkin, parent_comment__isnull=True)
        .select_related('user')
        .annotate(
            reaction_count=Count('reactions'),
            user_liked_ann=Exists(user_liked_sq),
        )
        .order_by('-reaction_count', '-created_at')
    )

    comments_data = [
        {
            'id': str(comment.id),
            'user': {
                'id': str(comment.user.id),
                'display_name': comment.user.display_name,
                'username': comment.user.username,
                'avatar_url': comment.user.avatar_url or None,
            },
            'description': comment.description,
            'created_at': comment.created_at.isoformat(),
            'like_count': comment.reaction_count,
            'user_liked': comment.user_liked_ann,
            'is_owner': comment.user == request.user,
            'reply_count': comment.reply_count,
        }
        for comment in comments
    ]

    return DRFResponse({
        'success': True,
        'comments': comments_data,
        'count': len(comments_data),
    })


def get_time_ago(dt):
    """Helper to format time ago string."""
    from django.utils import timezone
    now = timezone.now()
    diff = now - dt

    seconds = diff.total_seconds()
    if seconds < 60:
        return 'just now'
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f'{minutes}m ago'
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f'{hours}h ago'
    else:
        days = int(seconds / 86400)
        return f'{days}d ago'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_comment_view(request, post_id):
    """
    Add a comment to a post. Max 15 comments per user per post.
    """
    post = get_object_or_404(Post, id=post_id)

    text = (request.data.get('text', '') or '').strip()

    if not text:
        return DRFResponse({
            'success': False,
            'error': 'Comment text is required'
        }, status=400)

    if len(text) > 500:
        return DRFResponse({
            'success': False,
            'error': 'Comment is too long (max 500 characters)'
        }, status=400)

    # Check user's comment count on this post
    user_comment_count = Comment.objects.filter(post=post, user=request.user).count()
    if user_comment_count >= 15:
        return DRFResponse({
            'success': False,
            'error': 'You have reached the maximum number of comments (15) on this post'
        }, status=400)

    # Create the comment
    comment = Comment.objects.create(
        post=post,
        user=request.user,
        description=text,
    )

    from notifications.dispatcher import notify_comment
    notify_comment(request.user, post, comment)

    return DRFResponse({
        'success': True,
        'comment': {
            'id': str(comment.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar_url or None,
            },
            'description': comment.description,
            'created_at': comment.created_at.isoformat(),
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_checkin_comment_view(request, checkin_id):
    """
    Add a comment to a check-in. Max 15 comments per user per check-in.
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    text = (request.data.get('text', '') or '').strip()

    if not text:
        return DRFResponse({
            'success': False,
            'error': 'Comment text is required'
        }, status=400)

    if len(text) > 500:
        return DRFResponse({
            'success': False,
            'error': 'Comment is too long (max 500 characters)'
        }, status=400)

    user_comment_count = Comment.objects.filter(quick_workout=checkin, user=request.user).count()
    if user_comment_count >= 15:
        return DRFResponse({
            'success': False,
            'error': 'You have reached the maximum number of comments (15) on this post'
        }, status=400)

    comment = Comment.objects.create(
        quick_workout=checkin,
        user=request.user,
        description=text,
    )

    from notifications.dispatcher import notify_comment_on_checkin
    notify_comment_on_checkin(request.user, checkin, comment)

    return DRFResponse({
        'success': True,
        'comment': {
            'id': str(comment.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar_url or None,
            },
            'description': comment.description,
            'created_at': comment.created_at.isoformat(),
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
        }
    })


@login_required
@require_POST
def delete_post_view(request, post_id):
    """Delete a post. Only the post owner can delete it."""
    post = get_object_or_404(Post, id=post_id)
    if post.user != request.user:
        return JsonResponse({'success': False, 'error': 'You can only delete your own posts'}, status=403)
    post.delete()
    # Decrement total workouts (floor at 0)
    from accounts.models import User
    User.objects.filter(pk=request.user.pk, total_workouts__gt=0).update(total_workouts=F('total_workouts') - 1)
    request.user.refresh_from_db()
    return JsonResponse({'success': True, 'total_workouts': request.user.total_workouts})


@login_required
@require_POST
def delete_checkin_view(request, checkin_id):
    """Delete a check-in. Only the owner can delete it."""
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)
    if checkin.user != request.user:
        return JsonResponse({'success': False, 'error': 'You can only delete your own check-ins'}, status=403)
    # Also remove the photo file and MediaAsset/MediaLink if they exist
    photo_path = f'checkins/{checkin.id}.jpg'
    if default_storage.exists(photo_path):
        default_storage.delete(photo_path)
    # Clean up MediaLink/MediaAsset rows
    media_links = MediaLink.objects.filter(
        destination_type='quick_workout',
        destination_id=str(checkin.id),
    ).select_related('asset')
    for ml in media_links:
        ml.asset.delete()  # cascades to delete the MediaLink too
    checkin.delete()
    # Decrement total workouts (floor at 0)
    from accounts.models import User
    User.objects.filter(pk=request.user.pk, total_workouts__gt=0).update(total_workouts=F('total_workouts') - 1)
    request.user.refresh_from_db()
    return JsonResponse({'success': True, 'total_workouts': request.user.total_workouts})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_comment_view(request, comment_id):
    """
    Delete a comment. Only the comment owner can delete it.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    if comment.user != request.user:
        return DRFResponse({
            'success': False,
            'error': 'You can only delete your own comments'
        }, status=403)

    comment.delete()

    return DRFResponse({'success': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_comment_replies_view(request, comment_id):
    """
    Get all replies to a comment.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    replies = Comment.objects.filter(parent_comment=comment).select_related('user').order_by('created_at')

    replies_data = []
    for reply in replies:
        like_count = Reaction.objects.filter(comment=reply).count()
        user_liked = Reaction.objects.filter(comment=reply, user=request.user).exists()

        replies_data.append({
            'id': str(reply.id),
            'user': {
                'id': str(reply.user.id),
                'display_name': reply.user.display_name,
                'username': reply.user.username,
                'avatar_url': reply.user.avatar_url or None,
            },
            'description': reply.description,
            'created_at': reply.created_at.isoformat(),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': reply.user == request.user,
            'reply_count': reply.reply_count,
        })

    return DRFResponse({
        'success': True,
        'replies': replies_data,
        'count': len(replies_data),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_comment_reply_view(request, comment_id):
    """
    Add a reply to a comment. Max 15 replies per user per parent comment.
    """
    parent_comment = get_object_or_404(Comment, id=comment_id)

    text = (request.data.get('text', '') or '').strip()

    if not text:
        return DRFResponse({
            'success': False,
            'error': 'Reply text is required'
        }, status=400)

    if len(text) > 500:
        return DRFResponse({
            'success': False,
            'error': 'Reply is too long (max 500 characters)'
        }, status=400)

    # Check user's reply count on this comment
    user_reply_count = Comment.objects.filter(parent_comment=parent_comment, user=request.user).count()
    if user_reply_count >= 15:
        return DRFResponse({
            'success': False,
            'error': 'You have reached the maximum number of replies (15) on this comment'
        }, status=400)

    # Create the reply
    reply = Comment.objects.create(
        parent_comment=parent_comment,
        user=request.user,
        description=text,
    )

    from notifications.dispatcher import notify_comment_reply
    notify_comment_reply(request.user, parent_comment, reply)

    return DRFResponse({
        'success': True,
        'reply': {
            'id': str(reply.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar_url or None,
            },
            'description': reply.description,
            'created_at': reply.created_at.isoformat(),
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
        }
    })


@login_required
@require_GET
def search_feed_view(request):
    """Search posts/checkins by hashtag in description."""
    q = request.GET.get('q', '').strip()
    if not q:
        return JsonResponse({'posts': [], 'users': []})

    # Strip leading # if present — always search for #keyword
    tag = q.lstrip('#')
    if not tag:
        return JsonResponse({'posts': [], 'users': []})

    search_term = f'#{tag}'
    user = request.user

    # Search Posts
    post_qs = Post.objects.filter(
        description__icontains=search_term,
    ).select_related('user', 'location', 'workout').annotate(
        like_count=Subquery(
            Reaction.objects.filter(post=OuterRef('pk'))
            .values('post').annotate(c=Count('id')).values('c'),
            output_field=IntegerField(),
        ),
        comment_count=Subquery(
            Comment.objects.filter(post=OuterRef('pk'))
            .values('post').annotate(c=Count('id')).values('c'),
            output_field=IntegerField(),
        ),
        user_liked=Exists(Reaction.objects.filter(post=OuterRef('pk'), user=user)),
    ).order_by('-created_at')[:20]

    # Search QuickWorkouts
    qw_qs = QuickWorkout.objects.filter(
        description__icontains=search_term,
    ).select_related('user', 'location').annotate(
        like_count=Subquery(
            Reaction.objects.filter(quick_workout=OuterRef('pk'))
            .values('quick_workout').annotate(c=Count('id')).values('c'),
            output_field=IntegerField(),
        ),
        comment_count=Subquery(
            Comment.objects.filter(quick_workout=OuterRef('pk'))
            .values('quick_workout').annotate(c=Count('id')).values('c'),
            output_field=IntegerField(),
        ),
        user_liked=Exists(Reaction.objects.filter(quick_workout=OuterRef('pk'), user=user)),
    ).order_by('-created_at')[:20]

    # Merge and sort
    raw_items = []
    for qw in qw_qs:
        raw_items.append(('checkin', qw.created_at, qw.id, qw))
    for p in post_qs:
        raw_items.append(('post', p.created_at, p.id, p))
    raw_items.sort(key=lambda x: (x[1], x[2]), reverse=True)
    raw_items = raw_items[:20]

    # Collect IDs for bulk media fetch
    checkin_ids = [item[2] for item in raw_items if item[0] == 'checkin']
    post_ids = [item[2] for item in raw_items if item[0] == 'post']
    checkin_photos = _bulk_media_urls('quick_workout', checkin_ids)
    post_photos = _bulk_media_urls('post', post_ids)

    # Build feed items
    feed_items = []
    for item_type, created_at, item_id, obj in raw_items:
        if item_type == 'checkin':
            photo_url = checkin_photos.get(str(item_id))
            if not photo_url:
                path = f'checkins/{item_id}.jpg'
                try:
                    if default_storage.exists(path):
                        photo_url = build_media_url(path)
                except Exception:
                    pass
            feed_items.append({
                'type': 'checkin',
                'id': str(item_id),
                'user': obj.user,
                'location': obj.location,
                'location_name': obj.location_name or (obj.location.name if obj.location else ''),
                'workout_type': obj.type.replace('_', ' ').title() if obj.type else '',
                'description': obj.description,
                'created_at': created_at,
                'photo_url': photo_url,
                'like_count': obj.like_count,
                'comment_count': obj.comment_count,
                'user_liked': bool(obj.user_liked),
            })
        else:
            post = obj
            photo_url = post_photos.get(str(item_id)) or (build_media_url(post.photo.name) if post.photo else None)
            feed_items.append({
                'type': 'workout' if post.workout_id else 'post',
                'id': str(item_id),
                'user': post.user,
                'location': post.location,
                'description': post.description,
                'created_at': created_at,
                'photo_url': photo_url,
                'video_url': build_media_url(post.video.name) if post.video else None,
                'link_url': post.link_url,
                'like_count': post.like_count,
                'comment_count': post.comment_count,
                'user_liked': bool(post.user_liked),
            })

    items_json = _serialize_feed_items_for_json(feed_items)
    return JsonResponse({'posts': items_json, 'users': []})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_post_view(request):
    """
    Create a new text/media post. Supports token auth for mobile.
    Accepts multipart/form-data (with optional photo/video) or JSON.
    Posts always go to the Main feed.
    """
    # DRF request.data works for both multipart and JSON
    data = request.data
    text = (data.get('text') or '').strip()
    link_url = (data.get('link_url') or '').strip() or None
    visibility = data.get('visibility', 'main')
    reply_restriction = data.get('reply_restriction', 'everyone')
    photo = request.FILES.get('photo')
    video = request.FILES.get('video')
    workout_id = data.get('workout_id')

    # Poll data
    poll_question = (data.get('poll_question') or '').strip()
    poll_options = data.getlist('poll_options[]') if hasattr(data, 'getlist') else data.get('poll_options', [])
    poll_duration = float(data.get('poll_duration', 24))

    # PR data
    pr_exercise_name = (data.get('pr_exercise_name') or '').strip()
    pr_value = (data.get('pr_value') or '').strip()
    pr_unit = data.get('pr_unit', 'lbs')
    pr_achieved_date = data.get('pr_achieved_date', '')

    # Check if has PR
    has_pr = bool(pr_exercise_name and pr_value)

    # Validation
    if not text and not photo and not video and not poll_question and not has_pr and not workout_id:
        return DRFResponse({
            'success': False,
            'error': 'Post must have text, media, poll, a personal record, or an attached workout'
        }, status=400)

    if len(text) > 500:
        return DRFResponse({
            'success': False,
            'error': 'Post text cannot exceed 500 characters'
        }, status=400)

    # Resolve optional linked workout (attach by reference — never duplicates)
    linked_workout = None
    if workout_id:
        from workouts.models import Workout
        try:
            linked_workout = Workout.objects.get(id=workout_id, user=request.user)
        except Workout.DoesNotExist:
            pass  # Non-fatal — post without attachment

    # Create the post
    post = Post.objects.create(
        user=request.user,
        description=text,
        link_url=link_url,
        visibility=visibility,
        reply_restriction=reply_restriction,
        workout=linked_workout,
    )

    # Save photo if provided
    if photo:
        post.photo = photo
        post.save()
        # Track in MediaAsset/MediaLink (already_saved=True because ImageField saved it)
        asset = create_media_asset(request.user, photo, post.photo.name, 'image', already_saved=True)
        MediaLink.objects.create(
            asset=asset,
            destination_type='post',
            destination_id=str(post.id),
            type='inline',
        )

    # Save video if provided
    if video:
        post.video = video
        post.save()
        asset = create_media_asset(request.user, video, post.video.name, 'video', already_saved=True)
        MediaLink.objects.create(
            asset=asset,
            destination_type='post',
            destination_id=str(post.id),
            type='inline',
        )

    # Create poll if provided
    if poll_question and len(poll_options) >= 2:
        poll = Poll.objects.create(
            post=post,
            question=poll_question,
            duration_hours=max(1, int(poll_duration)),
            ends_at=timezone.now() + timedelta(hours=poll_duration),
        )

        for idx, option_text in enumerate(poll_options):
            if option_text.strip():
                PollOption.objects.create(
                    poll=poll,
                    text=option_text.strip(),
                    order=idx,
                )

    # Create PR if provided
    if has_pr:
        # Parse date
        if pr_achieved_date:
            try:
                achieved_date = date.fromisoformat(pr_achieved_date)
            except ValueError:
                achieved_date = date.today()
        else:
            achieved_date = date.today()

        # Check if there's an existing PR for this exercise
        existing_pr = PersonalRecord.objects.filter(
            user=request.user,
            exercise_name__iexact=pr_exercise_name
        ).first()

        if existing_pr:
            # Compare and only update if new value is better
            from accounts.views import is_new_pr_better
            if is_new_pr_better(pr_value, pr_unit, existing_pr.value, existing_pr.unit):
                # Update existing PR with new value and link to this post
                existing_pr.value = pr_value
                existing_pr.unit = pr_unit
                existing_pr.achieved_date = achieved_date
                existing_pr.post = post
                existing_pr.save()
        else:
            # Create new PR
            PersonalRecord.objects.create(
                user=request.user,
                post=post,
                exercise_name=pr_exercise_name,
                value=pr_value,
                unit=pr_unit,
                achieved_date=achieved_date,
            )

    return DRFResponse({
        'success': True,
        'post_id': str(post.id),
        'message': 'Post created successfully!'
    })


@login_required
@require_POST
def vote_poll_view(request, poll_id):
    """
    Vote on a poll option.
    If user has already voted, allows changing their vote.
    """
    poll = get_object_or_404(Poll, id=poll_id)

    # Check if poll is still active
    if not poll.is_active:
        return JsonResponse({
            'success': False,
            'error': 'This poll has ended'
        }, status=400)

    data = json.loads(request.body)
    option_id = data.get('option_id')

    option = get_object_or_404(PollOption, id=option_id, poll=poll)

    # Check if user already voted
    existing_vote = PollVote.objects.filter(poll=poll, user=request.user).first()

    if existing_vote:
        # User is changing their vote
        if str(existing_vote.option.id) == str(option_id):
            # Same option selected - no change needed
            pass
        else:
            # Different option - decrement old, increment new
            old_option = existing_vote.option
            old_option.votes = max(0, old_option.votes - 1)
            old_option.save()

            # Update vote to new option
            existing_vote.option = option
            existing_vote.save()

            # Increment new option
            option.votes += 1
            option.save()
    else:
        # New vote
        PollVote.objects.create(
            poll=poll,
            user=request.user,
            option=option,
        )

        # Increment vote count
        option.votes += 1
        option.save()

    # Get updated results — return full poll shape so frontend can reconstruct it
    total_votes = poll.get_total_votes()
    options_data = []
    for opt in poll.options.all().order_by('order'):
        percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
        options_data.append({
            'id': str(opt.id),
            'text': opt.text,
            'votes': opt.votes,
            'order': opt.order,
            'percentage': percentage,
        })

    return JsonResponse({
        'id': str(poll.id),
        'question': poll.question,
        'options': options_data,
        'total_votes': total_votes,
        'user_voted': str(option.id),
        'is_active': poll.is_active,
        'ends_at': poll.ends_at.isoformat() if poll.ends_at else None,
    })


@login_required
@require_GET
def poll_voters_view(request, poll_id):
    """
    Return per-option voter lists for a poll.
    Only the post owner can access this.
    """
    poll = get_object_or_404(Poll, id=poll_id)

    if poll.post.user != request.user:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    options_data = []
    for opt in poll.options.all().order_by('order'):
        votes = PollVote.objects.filter(option=opt).select_related('user')
        voters = []
        for v in votes:
            try:
                avatar_url = v.user.avatar_url
            except Exception:
                avatar_url = None
            voters.append({
                'username': v.user.username,
                'display_name': v.user.display_name,
                'avatar_url': avatar_url,
            })
        options_data.append({
            'id': str(opt.id),
            'text': opt.text,
            'voters': voters,
        })

    return JsonResponse({'options': options_data})


@login_required
@require_GET
def share_recipients_view(request):
    """
    Get friends (mutual follows) and groups for the share modal.
    Supports ?q= search parameter.
    """
    user = request.user
    q = request.GET.get('q', '').strip().lower()

    # Get mutual follows (friends)
    from accounts.models import User as UserModel
    my_following_ids = set(Follow.objects.filter(follower=user).values_list('following_id', flat=True))
    my_follower_ids = set(Follow.objects.filter(following=user).values_list('follower_id', flat=True))
    friend_ids = my_following_ids & my_follower_ids

    friends_qs = UserModel.objects.filter(id__in=friend_ids).order_by('display_name')
    if q:
        friends_qs = friends_qs.filter(
            Q(display_name__icontains=q) | Q(username__icontains=q)
        )

    friends = []
    for f in friends_qs[:30]:
        friends.append({
            'id': str(f.id),
            'display_name': f.display_name,
            'username': f.username,
            'avatar_url': f.avatar_url or None,
            'type': 'user',
        })

    # Get user's groups
    groups_qs = Group.objects.filter(
        members__user=user
    ).order_by('name')
    if q:
        groups_qs = groups_qs.filter(name__icontains=q)

    groups = []
    for g in groups_qs[:20]:
        groups.append({
            'id': str(g.id),
            'name': g.name,
            'type': 'group',
        })

    return JsonResponse({
        'success': True,
        'friends': friends,
        'groups': groups,
    })


@login_required
@require_POST
def share_post_view(request):
    """
    Share a post or check-in to one or more friends and/or groups.
    Body JSON: { post_id, item_type, recipient_ids: [], group_ids: [] }
    """
    data = json.loads(request.body)
    item_id = data.get('post_id', '')
    item_type = data.get('item_type', 'post')
    user_message = data.get('message', '').strip()
    recipient_ids = data.get('recipient_ids', [])
    group_ids = data.get('group_ids', [])

    if not item_id:
        return JsonResponse({'success': False, 'error': 'Item ID is required'}, status=400)

    if not recipient_ids and not group_ids:
        return JsonResponse({'success': False, 'error': 'Select at least one recipient'}, status=400)

    # Determine if this is a Post or a QuickWorkout (check-in)
    post_id_for_msg = None
    qw_id_for_msg = None
    if item_type == 'checkin':
        checkin = get_object_or_404(QuickWorkout, id=item_id)
        qw_id_for_msg = str(checkin.id)
    else:
        post = get_object_or_404(Post, id=item_id)
        post_id_for_msg = str(post.id)

    content = user_message if user_message else "Shared a post"

    sent_count = 0
    errors = []

    # Send to individual friends
    for rid in recipient_ids:
        try:
            send_dm(request.user, rid, content, post_id=post_id_for_msg, quick_workout_id=qw_id_for_msg)
            sent_count += 1
        except (NotMutualFollowError, UserBlockedError) as e:
            errors.append(str(e))

    # Send to groups
    for gid in group_ids:
        try:
            send_group_message(request.user, gid, content, post_id=post_id_for_msg, quick_workout_id=qw_id_for_msg)
            sent_count += 1
        except (NotGroupMemberError, PostNotFoundError) as e:
            errors.append(str(e))

    return JsonResponse({
        'success': True,
        'sent_count': sent_count,
        'errors': errors,
    })


@login_required
@require_GET
def leaderboard_view(request):
    from accounts.models import User

    active_tab = request.GET.get('tab', 'friends')

    # --- Friends leaderboard ---
    following_ids = list(
        Follow.objects.filter(follower=request.user)
        .values_list('following_id', flat=True)
    )
    all_ids = following_ids + [request.user.id]
    friends_qs = (
        User.objects.filter(id__in=all_ids)
        .order_by('-current_streak', '-total_workouts')
        .only('id', 'username', 'display_name', 'current_streak', 'total_workouts', 'avatar')
    )
    friends_ranked = [
        {'rank': i + 1, 'user': u}
        for i, u in enumerate(friends_qs)
    ]
    friends_my_rank = next(
        (e['rank'] for e in friends_ranked if e['user'].id == request.user.id), None
    )

    # --- Gym leaderboard ---
    enrolled_gyms = list(request.user.enrolled_gyms.all())
    gym_id_param = request.GET.get('gym_id')
    selected_gym = None
    if gym_id_param:
        selected_gym = next((g for g in enrolled_gyms if str(g.id) == gym_id_param), None)
    if not selected_gym and enrolled_gyms:
        selected_gym = enrolled_gyms[0]

    gym_ranked = []
    gym_my_rank = None
    if selected_gym:
        gym_qs = (
            User.objects.filter(enrolled_gyms=selected_gym)
            .order_by('-current_streak', '-total_workouts')
            .only('id', 'username', 'display_name', 'current_streak', 'total_workouts', 'avatar')
        )
        gym_ranked = [
            {'rank': i + 1, 'user': u}
            for i, u in enumerate(gym_qs)
        ]
        gym_my_rank = next(
            (e['rank'] for e in gym_ranked if e['user'].id == request.user.id), None
        )

    return render(request, 'social/leaderboard.html', {
        'friends_ranked': friends_ranked,
        'friends_my_rank': friends_my_rank,
        'gym_ranked': gym_ranked,
        'gym_my_rank': gym_my_rank,
        'selected_gym': selected_gym,
        'enrolled_gyms': enrolled_gyms,
        'active_tab': active_tab,
    })
