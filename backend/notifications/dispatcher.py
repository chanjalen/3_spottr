import threading

from notifications.models import Notification
from accounts.push import send_push_to_user


def _push_notification_unread(user):
    """Push the current unread notification count to the user's WS dm channel."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        count = Notification.objects.filter(
            recipient=user,
            read_at__isnull=True,
        ).count()
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"dm_{str(user.id).replace('-', '')}",
                {'type': 'notification_unread_update', 'count': count},
            )
    except Exception:
        pass


def _resolve_comment_parent(comment):
    """Return (parent_id_str, target_type) for the post/checkin a comment belongs to."""
    if comment.post_id:
        return str(comment.post_id), Notification.TargetType.POST
    if comment.quick_workout_id:
        return str(comment.quick_workout_id), Notification.TargetType.QUICK_WORKOUT
    return None, None


def notify_like_post(actor, post):
    """Create a DB notification and send push when someone likes a post."""
    if actor.id == post.user_id:
        return
    Notification.objects.create(
        recipient=post.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_POST,
        target_type=Notification.TargetType.POST,
        target_id=str(post.id),
    )
    send_push_to_user(
        post.user,
        title='New like ❤️',
        body=f'@{actor.username} liked your post',
        data={'type': 'like_post', 'post_id': str(post.id)},
    )
    _push_notification_unread(post.user)


def notify_like_checkin(actor, checkin):
    """Create a DB notification and send push when someone likes a check-in."""
    if actor.id == checkin.user_id:
        return
    Notification.objects.create(
        recipient=checkin.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_CHECKIN,
        target_type=Notification.TargetType.QUICK_WORKOUT,
        target_id=str(checkin.id),
    )
    send_push_to_user(
        checkin.user,
        title='New like ❤️',
        body=f'@{actor.username} liked your check-in',
        data={'type': 'like_checkin', 'checkin_id': str(checkin.id)},
    )
    _push_notification_unread(checkin.user)


def notify_like_comment(actor, comment):
    """Create a DB notification and send push when someone likes a comment."""
    if actor.id == comment.user_id:
        return
    parent_id, parent_type = _resolve_comment_parent(comment)
    Notification.objects.create(
        recipient=comment.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_COMMENT,
        target_type=Notification.TargetType.COMMENT,
        target_id=str(comment.id),
        context_type=parent_type or '',
        context_id=parent_id or '',
    )
    send_push_to_user(
        comment.user,
        title='New like ❤️',
        body=f'@{actor.username} liked your comment',
        data={
            'type': 'like_comment',
            'comment_id': str(comment.id),
            'post_id': parent_id or '',
            'item_type': 'post' if parent_type == Notification.TargetType.POST else 'checkin',
        },
    )
    _push_notification_unread(comment.user)


def notify_comment(actor, post, comment):
    """Create a DB notification and send push when someone comments on a post."""
    if actor.id == post.user_id:
        return
    Notification.objects.create(
        recipient=post.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=Notification.TargetType.POST,
        target_id=str(post.id),
        context_type=Notification.TargetType.COMMENT,
        context_id=str(comment.id),
    )
    send_push_to_user(
        post.user,
        title='New comment 💬',
        body=f'@{actor.username} commented on your post',
        data={'type': 'comment', 'post_id': str(post.id), 'comment_id': str(comment.id)},
    )
    _push_notification_unread(post.user)


def notify_comment_on_checkin(actor, checkin, comment):
    """Create a DB notification and send push when someone comments on a check-in."""
    if actor.id == checkin.user_id:
        return
    Notification.objects.create(
        recipient=checkin.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=Notification.TargetType.QUICK_WORKOUT,
        target_id=str(checkin.id),
        context_type=Notification.TargetType.COMMENT,
        context_id=str(comment.id),
    )
    send_push_to_user(
        checkin.user,
        title='New comment 💬',
        body=f'@{actor.username} commented on your check-in',
        data={'type': 'comment', 'checkin_id': str(checkin.id), 'comment_id': str(comment.id)},
    )
    _push_notification_unread(checkin.user)


def notify_comment_reply(actor, parent_comment, reply):
    """Create a DB notification and send push when someone replies to a comment."""
    if actor.id == parent_comment.user_id:
        return
    parent_id, parent_type = _resolve_comment_parent(parent_comment)
    Notification.objects.create(
        recipient=parent_comment.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=parent_type or Notification.TargetType.COMMENT,
        target_id=parent_id or str(parent_comment.id),
        context_type='comment_reply',
        context_id=str(reply.id),
    )
    send_push_to_user(
        parent_comment.user,
        title='New reply 💬',
        body=f'@{actor.username} replied to your comment',
        data={
            'type': 'comment_reply',
            'comment_id': str(reply.id),
            'post_id': parent_id or '',
            'item_type': 'post' if parent_type == Notification.TargetType.POST else 'checkin',
        },
    )
    _push_notification_unread(parent_comment.user)


def notify_follow(actor, target_user):
    """Create a DB notification and send push when someone follows a user."""
    if actor.id == target_user.id:
        return
    Notification.objects.create(
        recipient=target_user,
        triggered_by=actor,
        type=Notification.Type.FOLLOW,
        target_type=Notification.TargetType.USER,
        target_id=str(target_user.id),
    )
    send_push_to_user(
        target_user,
        title='New follower 👀',
        body=f'@{actor.username} started following you',
        data={'type': 'follow', 'user_id': str(actor.id), 'username': actor.username},
    )
    _push_notification_unread(target_user)


def notify_workout_invite(actor, recipient, workout_invite):
    """Create a DB notification and send push when someone sends a workout invite."""
    if actor.id == recipient.id:
        return
    Notification.objects.create(
        recipient=recipient,
        triggered_by=actor,
        type=Notification.Type.WORKOUT_INVITE,
        target_type=Notification.TargetType.WORKOUT_INVITE,
        target_id=str(workout_invite.id),
    )
    send_push_to_user(
        recipient,
        title='Workout invite 🏋️',
        body=f'@{actor.username} invited you to work out',
        data={
            'type': 'workout_invite',
            'invite_id': str(workout_invite.id),
            'gym_id': str(workout_invite.gym_id),
            'gym_name': workout_invite.gym.name,
        },
    )
    _push_notification_unread(recipient)


def notify_mention(actor, recipient, target_type, target_id, context_type=None, context_id=None):
    """
    Generic mention notifier. Called when @username is found in a comment or reply.
    target_type: Notification.TargetType value (POST, QUICK_WORKOUT, COMMENT)
    target_id:   str UUID of the containing content
    context_type/context_id: optional parent content
    """
    if actor.id == recipient.id:
        return
    Notification.objects.create(
        recipient=recipient,
        triggered_by=actor,
        type=Notification.Type.MENTION,
        target_type=target_type,
        target_id=str(target_id),
        context_type=context_type or '',
        context_id=str(context_id) if context_id else '',
    )
    if target_type == Notification.TargetType.POST:
        push_data = {'type': 'mention', 'post_id': str(target_id), 'item_type': 'post'}
    elif target_type == Notification.TargetType.QUICK_WORKOUT:
        push_data = {'type': 'mention', 'post_id': str(target_id), 'item_type': 'checkin'}
    elif target_type == Notification.TargetType.COMMENT:
        push_data = {
            'type': 'mention',
            'comment_id': str(target_id),
            'post_id': str(context_id) if context_id else '',
            'item_type': 'post' if context_type == Notification.TargetType.POST else 'checkin',
        }
    else:
        push_data = {'type': 'mention', 'post_id': str(target_id), 'item_type': 'post'}
    send_push_to_user(
        recipient,
        title='You were mentioned 📣',
        body=f'@{actor.username} mentioned you',
        data=push_data,
    )
    _push_notification_unread(recipient)


def notify_group_join_request(actor, group, join_request):
    """Notify all group admins (with push) when someone requests to join a private group."""
    from groups.models import GroupMember
    admin_memberships = GroupMember.objects.filter(
        group=group,
        role__in=['admin', 'creator'],
    ).select_related('user')
    for membership in admin_memberships:
        if membership.user_id != actor.id:
            Notification.objects.create(
                recipient=membership.user,
                triggered_by=actor,
                type=Notification.Type.JOIN_REQUEST,
                target_type=Notification.TargetType.GROUP,
                target_id=str(group.id),
                context_type='join_request',
                context_id=str(join_request.id),
            )
            send_push_to_user(
                membership.user,
                title='Join request 🙋',
                body=f'@{actor.username} wants to join {group.name}',
                data={'type': 'join_request', 'group_id': str(group.id)},
            )
            _push_notification_unread(membership.user)


def notify_workout_join_request(actor, workout_invite, join_request):
    """Notify the workout invite owner (with push) when someone requests to join."""
    owner = workout_invite.user
    if actor.id == owner.id:
        return
    Notification.objects.create(
        recipient=owner,
        triggered_by=actor,
        type=Notification.Type.JOIN_REQUEST,
        target_type=Notification.TargetType.WORKOUT_INVITE,
        target_id=str(workout_invite.id),
        context_type='workout_join_request',
        context_id=str(join_request.id),
    )
    send_push_to_user(
        owner,
        title='Join request 🏋️',
        body=f'@{actor.username} wants to join your workout',
        data={
            'type': 'workout_join_request',
            'invite_id': str(workout_invite.id),
            'gym_id': str(workout_invite.gym_id),
            'gym_name': workout_invite.gym.name,
        },
    )
    _push_notification_unread(owner)


def notify_workout_join_request_accepted(creator, requester, workout_invite):
    """
    Notify the requester that the workout invite owner accepted their join request.
    context_type='dm' → context_id=creator user ID (1-on-1 invite)
    context_type='group' → context_id=group chat ID (multi-person invite)
    """
    if workout_invite.total_spots == 1:
        context_type = 'dm'
        context_id = str(creator.id)
    else:
        context_type = 'group'
        context_id = str(workout_invite.workout_chat_id) if workout_invite.workout_chat_id else str(creator.id)

    Notification.objects.create(
        recipient=requester,
        triggered_by=creator,
        type=Notification.Type.JOIN_ACCEPTED,
        target_type=Notification.TargetType.WORKOUT_INVITE,
        target_id=str(workout_invite.id),
        context_type=context_type,
        context_id=context_id,
    )
    send_push_to_user(
        requester,
        title='Request accepted! 🏋️',
        body=f'@{creator.username} accepted your request to join the workout',
        data={
            'type': 'join_accepted',
            'invite_id': str(workout_invite.id),
            'context_type': context_type,
            'context_id': context_id,
        },
    )
    _push_notification_unread(requester)


def _friend_checkin_worker(checkin_user_id):
    """
    Background worker: push each follower of checkin_user showing how many
    of their friends have checked in today (cumulative count as day progresses).
    """
    import logging
    import zoneinfo
    from datetime import datetime, timedelta

    from social.models import Follow, QuickWorkout
    from django.utils import timezone as tz_util
    from django.core.cache import cache
    from accounts.models import User

    worker_logger = logging.getLogger(__name__)

    try:
        checkin_user = User.objects.get(id=checkin_user_id)
    except User.DoesNotExist:
        return

    now_utc = tz_util.now()

    followers = list(
        Follow.objects.filter(following=checkin_user).select_related('follower')
    )
    if not followers:
        return

    for follow_rel in followers:
        try:
            follower = follow_rel.follower
            if not getattr(follower, 'push_notifications', True):
                continue
            if not getattr(follower, 'expo_push_token', ''):
                continue

            try:
                tz = zoneinfo.ZoneInfo(follower.timezone or 'UTC')
            except Exception:
                tz = zoneinfo.ZoneInfo('UTC')
            local_today = now_utc.astimezone(tz).date()

            # All users this follower follows who checked in today (timezone-aware bounds)
            day_start = datetime(local_today.year, local_today.month, local_today.day, tzinfo=tz)
            day_end = day_start + timedelta(days=1)

            friend_ids = Follow.objects.filter(
                follower=follower,
            ).values_list('following_id', flat=True)

            friend_usernames = list(
                QuickWorkout.objects.filter(
                    user_id__in=friend_ids,
                    created_at__gte=day_start,
                    created_at__lt=day_end,
                )
                .order_by('created_at')
                .values_list('user__username', flat=True)
                .distinct()
            )

            # Ensure the person who just checked in is first
            if checkin_user.username in friend_usernames:
                friend_usernames.remove(checkin_user.username)
            friend_usernames.insert(0, checkin_user.username)

            count = len(friend_usernames)
            # Only notify for the 1st, 2nd, and 3rd friend check-in of the day
            if count > 3:
                continue

            # Dedup: one push per follower per milestone per day
            cache_key = f'friend_checkin:{follower.id}:{local_today}:{count}'
            if cache.get(cache_key):
                continue
            cache.set(cache_key, True, timeout=60 * 60 * 25)

            if count == 1:
                body = f'@{friend_usernames[0]} just checked in 💪'
            elif count == 2:
                body = f'@{friend_usernames[0]} and @{friend_usernames[1]} checked in today 💪'
            else:
                body = f'@{friend_usernames[0]} and {count - 1} others checked in today 💪'

            send_push_to_user(
                follower,
                title='Friends are working out 💪',
                body=body,
                data={'type': 'friend_checkin'},
            )
        except Exception as e:
            worker_logger.warning(
                '_friend_checkin_worker: error for follower %s: %s',
                follow_rel.follower_id,
                e,
            )
            continue


def notify_friend_checkin(checkin_user):
    """
    Fire-and-forget: push all followers when checkin_user checks in.
    Runs in a background thread so it doesn't slow down the check-in response.
    """
    threading.Thread(
        target=_friend_checkin_worker,
        args=(checkin_user.id,),
        daemon=True,
    ).start()
