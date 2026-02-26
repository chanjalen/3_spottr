import json
from collections import OrderedDict
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from notifications.models import Notification
from media.utils import get_media_url, build_media_url


def _time_ago(dt):
    """Return a human-friendly time-ago string."""
    now = timezone.now()
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return 'just now'
    minutes = seconds // 60
    if minutes < 60:
        return f'{minutes}m'
    hours = minutes // 60
    if hours < 24:
        return f'{hours}h'
    days = hours // 24
    if days < 7:
        return f'{days}d'
    weeks = days // 7
    if weeks < 4:
        return f'{weeks}w'
    return dt.strftime('%b %d')


def _user_avatar(user):
    """Return avatar URL or None."""
    url = getattr(user, 'avatar_url', None)
    return url if url else None


def _post_thumbnail(post):
    """Return a thumbnail URL for a post, or None."""
    url = get_media_url('post', str(post.id))
    if url:
        return url
    if post.photo:
        return build_media_url(post.photo.name)
    return None


def _build_notification_item(notif, actor):
    """Build a single notification dict for the API response."""
    return {
        'id': str(notif.id),
        'type': notif.type,
        'target_type': notif.target_type,
        'target_id': notif.target_id,
        'context_id': notif.context_id,
        'is_read': notif.read_at is not None,
        'time_ago': _time_ago(notif.created_at),
        'created_at': notif.created_at.isoformat(),
        'actor': {
            'id': str(actor.id),
            'username': actor.username,
            'display_name': actor.display_name or actor.username,
            'avatar_url': _user_avatar(actor),
        } if actor else None,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    """
    GET /api/notifications/
    Returns grouped notifications list (like grouping for same post).
    """
    notifications = (
        Notification.objects
        .filter(recipient=request.user)
        .select_related('triggered_by')
        .order_by('-created_at')[:100]
    )

    # Group like_post notifications by target_id (post)
    # Keep insertion order so we can merge them chronologically
    grouped = []
    like_groups = OrderedDict()  # target_id -> list of notifs

    for notif in notifications:
        if notif.type == Notification.Type.LIKE_POST:
            key = notif.target_id
            if key not in like_groups:
                like_groups[key] = {
                    'notifs': [],
                    'insert_index': len(grouped),
                }
                grouped.append(('like_group_placeholder', key))
            like_groups[key]['notifs'].append(notif)
        else:
            grouped.append(('single', notif))

    # Now resolve the grouped items into the final list
    # Fetch post thumbnails for like groups
    from social.models import Post
    post_ids = list(like_groups.keys())
    posts_by_id = {}
    if post_ids:
        for post in Post.objects.filter(id__in=post_ids):
            posts_by_id[str(post.id)] = post

    # Pre-fetch workout join request descriptions (avoid N+1 in the loop below)
    from gyms.models import JoinRequest as GymJoinRequest
    workout_jr_context_ids = [
        n.context_id for n in notifications
        if n.type == Notification.Type.JOIN_REQUEST
        and n.target_type == Notification.TargetType.WORKOUT_INVITE
        and n.context_id
    ]
    workout_jr_descriptions = {}
    if workout_jr_context_ids:
        for jr in GymJoinRequest.objects.filter(id__in=workout_jr_context_ids).values('id', 'description'):
            workout_jr_descriptions[str(jr['id'])] = jr['description']

    result = []
    for entry_type, entry_data in grouped:
        if entry_type == 'like_group_placeholder':
            group = like_groups[entry_data]
            notifs = group['notifs']
            post = posts_by_id.get(entry_data)

            # Collect actors (most recent first, already sorted)
            actors = []
            seen_actors = set()
            for n in notifs:
                if n.triggered_by and n.triggered_by_id not in seen_actors:
                    seen_actors.add(n.triggered_by_id)
                    actors.append({
                        'id': str(n.triggered_by.id),
                        'username': n.triggered_by.username,
                        'display_name': n.triggered_by.display_name or n.triggered_by.username,
                        'avatar_url': _user_avatar(n.triggered_by),
                    })

            total_likers = len(actors)

            # Build message text
            if total_likers == 1:
                msg = f"{actors[0]['display_name']} liked your post"
            elif total_likers == 2:
                msg = f"{actors[0]['display_name']} and {actors[1]['display_name']} liked your post"
            elif total_likers == 3:
                msg = f"{actors[0]['display_name']}, {actors[1]['display_name']} and {actors[2]['display_name']} liked your post"
            elif total_likers >= 10:
                msg = f"{actors[0]['display_name']}, {actors[1]['display_name']} and {total_likers - 2}+ others liked your post"
            else:
                msg = f"{actors[0]['display_name']}, {actors[1]['display_name']} and {total_likers - 2} others liked your post"

            # All notif IDs in this group
            notif_ids = [str(n.id) for n in notifs]
            is_read = all(n.read_at is not None for n in notifs)
            latest = notifs[0]

            result.append({
                'id': notif_ids[0],
                'ids': notif_ids,
                'type': 'like_post',
                'grouped': True,
                'target_type': 'post',
                'target_id': entry_data,
                'is_read': is_read,
                'time_ago': _time_ago(latest.created_at),
                'created_at': latest.created_at.isoformat(),
                'message': msg,
                'actors': actors[:3],
                'total_actors': total_likers,
                'thumbnail': _post_thumbnail(post) if post else None,
            })
        else:
            notif = entry_data
            actor = notif.triggered_by
            item = _build_notification_item(notif, actor)

            # Build message
            actor_name = actor.display_name or actor.username if actor else 'Someone'
            if notif.type == Notification.Type.COMMENT:
                # Try to get comment text preview
                comment_text = ''
                if notif.context_id:
                    from social.models import Comment
                    try:
                        comment = Comment.objects.get(id=notif.context_id)
                        comment_text = comment.description[:50]
                        if len(comment.description) > 50:
                            comment_text += '...'
                    except Comment.DoesNotExist:
                        pass

                if notif.target_type == Notification.TargetType.COMMENT:
                    item['message'] = f"{actor_name} replied to your comment"
                else:
                    item['message'] = f"{actor_name} commented: \"{comment_text}\"" if comment_text else f"{actor_name} commented on your post"

                # Add thumbnail for post comments
                if notif.target_type == Notification.TargetType.POST:
                    post = posts_by_id.get(notif.target_id)
                    if not post:
                        try:
                            post = Post.objects.get(id=notif.target_id)
                        except Post.DoesNotExist:
                            post = None
                    item['thumbnail'] = _post_thumbnail(post) if post else None

            elif notif.type == Notification.Type.FOLLOW:
                item['message'] = f"{actor_name} started following you"

            elif notif.type == Notification.Type.WORKOUT_INVITE:
                item['message'] = f"{actor_name} invited you to work out"

            elif notif.type == Notification.Type.JOIN_REQUEST:
                if notif.target_type == Notification.TargetType.GROUP:
                    from groups.models import Group as GroupModel
                    try:
                        group = GroupModel.objects.get(id=notif.target_id)
                        group_name = group.name
                    except GroupModel.DoesNotExist:
                        group_name = 'your group'
                    item['message'] = f"{actor_name} wants to join {group_name}"
                else:
                    item['message'] = f"{actor_name} requested to join your workout"
                    item['description'] = workout_jr_descriptions.get(notif.context_id, '')

            else:
                item['message'] = f"{actor_name} sent you a notification"

            item['grouped'] = False
            item['actors'] = [item.pop('actor')] if item.get('actor') else []
            item['total_actors'] = len(item['actors'])
            result.append(item)

    # Batch-look up action statuses for actionable notification types
    from groups.models import GroupJoinRequest
    from social.models import Follow

    # Pre-fetch which follow-notification actors the current user already follows
    follow_actor_ids = [
        item['actors'][0]['id'] for item in result
        if item['type'] == 'follow' and item.get('actors')
    ]
    already_following_ids = set()
    if follow_actor_ids:
        already_following_ids = set(
            str(fid) for fid in Follow.objects.filter(
                follower=request.user,
                following_id__in=follow_actor_ids,
            ).values_list('following_id', flat=True)
        )

    group_jr_ids = [
        item['context_id'] for item in result
        if item['type'] == 'join_request' and item.get('target_type') == 'group' and item.get('context_id')
    ]
    workout_jr_ids = [
        item['context_id'] for item in result
        if item['type'] == 'join_request' and item.get('target_type') == 'workout_invite' and item.get('context_id')
    ]
    workout_invite_ids = [
        item['target_id'] for item in result
        if item['type'] == 'workout_invite' and item.get('target_id')
    ]

    group_jr_statuses = {}
    if group_jr_ids:
        for jr in GroupJoinRequest.objects.filter(id__in=group_jr_ids).values('id', 'status'):
            group_jr_statuses[str(jr['id'])] = jr['status']

    gym_jr_statuses = {}
    if workout_jr_ids:
        for jr in GymJoinRequest.objects.filter(id__in=workout_jr_ids).values('id', 'status'):
            gym_jr_statuses[str(jr['id'])] = jr['status']

    workout_invite_accepted = set()
    if workout_invite_ids:
        for jr_invite_id in GymJoinRequest.objects.filter(
            workout_invite_id__in=workout_invite_ids,
            user=request.user,
        ).exclude(status='deny').values_list('workout_invite_id', flat=True):
            workout_invite_accepted.add(str(jr_invite_id))

    final_result = []
    for item in result:
        t = item['type']
        tt = item.get('target_type', '')
        if t == 'join_request' and tt == 'group':
            jr_status = group_jr_statuses.get(item.get('context_id', ''), 'pending')
            if jr_status == 'denied':
                continue
            item['action_status'] = 'accepted' if jr_status == 'accepted' else 'pending'
        elif t == 'join_request' and tt == 'workout_invite':
            jr_status = gym_jr_statuses.get(item.get('context_id', ''), 'pending')
            if jr_status == 'deny':
                continue
            item['action_status'] = 'accepted' if jr_status == 'accept' else 'pending'
        elif t == 'workout_invite':
            item['action_status'] = 'accepted' if item.get('target_id') in workout_invite_accepted else 'pending'
        elif t == 'follow':
            actor_id = item['actors'][0]['id'] if item.get('actors') else None
            item['action_status'] = 'accepted' if actor_id in already_following_ids else 'pending'
        final_result.append(item)

    return JsonResponse({'success': True, 'notifications': final_result})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count(request):
    """GET /api/notifications/unread-count/"""
    count = Notification.objects.filter(
        recipient=request.user,
        read_at__isnull=True,
    ).count()
    return JsonResponse({'count': count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read(request):
    """POST /api/notifications/mark-read/ with body {ids: [...]}"""
    data = request.data if hasattr(request, 'data') else json.loads(request.body)
    ids = data.get('ids', [])
    if ids:
        Notification.objects.filter(
            recipient=request.user,
            id__in=ids,
            read_at__isnull=True,
        ).update(read_at=timezone.now())
    return JsonResponse({'success': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    """POST /api/notifications/mark-all-read/"""
    Notification.objects.filter(
        recipient=request.user,
        read_at__isnull=True,
    ).update(read_at=timezone.now())
    return JsonResponse({'success': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_all(request):
    """POST /api/notifications/clear-all/ — delete all notifications for the user."""
    Notification.objects.filter(recipient=request.user).delete()
    return JsonResponse({'success': True})
