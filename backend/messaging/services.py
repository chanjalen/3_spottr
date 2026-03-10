import logging

from django.db.models import Q
from django.db.models import Prefetch

from .models import Message, MessageRead, InboxEntry, MessageReaction
from .exceptions import (
    NotMutualFollowError,
    UserBlockedError,
    NotGroupMemberError,
    MessageNotFoundError,
    ConversationNotFoundError,
    PostNotFoundError,
    CannotMessageSelfError,
    RecipientNotFoundError,
    RecipientAlreadyCheckedInError,
    MediaAssetNotFoundError,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# WebSocket broadcast helpers
# ---------------------------------------------------------------------------

def _clean_id(value):
    """Strip hyphens from UUID strings for use as channel group names."""
    return str(value).replace('-', '')


def _serialize_shared_post(message):
    """Return the nested shared_post dict for WebSocket payloads, or None."""
    try:
        if message.post_id:
            post = message.post
            if post:
                from messaging.serializers import SharedPostSerializer
                return SharedPostSerializer(post).data
        if message.quick_workout_id:
            qw = message.quick_workout
            if qw:
                from messaging.serializers import SharedCheckinSerializer
                return SharedCheckinSerializer(qw).data
    except Exception:
        pass
    return None


def _serialize_shared_profile(message):
    """Return the nested shared_profile_card dict for WebSocket payloads, or None."""
    try:
        if message.shared_profile_id and message.shared_profile:
            from messaging.serializers import SharedProfileSerializer
            return SharedProfileSerializer(message.shared_profile).data
    except Exception:
        pass
    return None


def _serialize_for_ws(message, recipient_id, client_msg_id=None):
    """
    Build a minimal message dict for WebSocket delivery.
    Shape matches MessageListSerializer so the frontend handles both identically.
    recipient_id is the ID of the other person in a DM (used for client-side routing).
    client_msg_id, if provided, is echoed back so the sender can reconcile their
    optimistic (pending) message with the confirmed server message.
    """
    from media.models import MediaLink
    from django.conf import settings

    media_links = (
        MediaLink.objects
        .filter(destination_type='message', destination_id=str(message.id), type='inline')
        .select_related('asset')
        .order_by('position')
    )
    media = []
    for link in media_links:
        asset = link.asset
        thumbnail_url = (
            f"{settings.MEDIA_URL}{asset.thumbnail_key}" if asset.thumbnail_key else None
        )
        media.append({
            'url': asset.url,
            'kind': asset.kind,
            'thumbnail_url': thumbnail_url,
            'width': asset.width,
            'height': asset.height,
        })

    payload = {
        'id': message.id,
        'sender': message.sender_id,
        'sender_username': message.sender.username if message.sender else None,
        'sender_avatar_url': message.sender.avatar_url if message.sender else None,
        'content': message.content,
        'media': media,
        'created_at': message.created_at.isoformat(),
        'is_read': False,
        'is_system': message.is_system,
        'is_request': message.is_request,
        'shared_post': _serialize_shared_post(message),
        'shared_profile_card': _serialize_shared_profile(message),
        'join_request_id': None,
        'join_request_status': None,
        # Routing fields — used by the client to decide which chat to update.
        'dm_recipient_id': str(recipient_id) if recipient_id else None,
        'group_id': str(message.group_id) if message.group_id else None,
    }
    if client_msg_id:
        payload['client_msg_id'] = client_msg_id
    return payload


def _broadcast(group_name, message_data):
    """
    Send a new_message event to a channel layer group.
    Silently swallowed if Redis is unavailable so a missing WS never breaks a send.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                group_name,
                {'type': 'new_message', 'message': message_data},
            )
    except Exception as exc:
        logger.warning("WS broadcast to %s failed: %s", group_name, exc)


def _push_unread_update(user):
    """
    Recalculate unread counts for user and push to their DM channel group.
    Called after a message is delivered so the badge/counter updates in real time.
    """
    try:
        counts = get_unread_count(user)
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"dm_{_clean_id(user.id)}",
                {'type': 'unread_update', 'counts': counts},
            )
    except Exception as exc:
        logger.warning("Unread push to user %s failed: %s", user.id, exc)


# ---------------------------------------------------------------------------
# InboxEntry helpers
# ---------------------------------------------------------------------------

def _update_inbox_dm(message, sender, recipient):
    """Update InboxEntry for both DM participants. Called inline on every send."""
    from django.db.models import F

    # Sender: latest message updated, unread stays 0
    InboxEntry.objects.update_or_create(
        user=sender, conversation_type='dm', partner=recipient,
        defaults={
            'latest_message': message,
            'latest_message_at': message.created_at,
            'unread_count': 0,
        },
    )
    # Recipient: latest message updated, unread incremented atomically
    entry, created = InboxEntry.objects.get_or_create(
        user=recipient, conversation_type='dm', partner=sender,
        defaults={
            'latest_message': message,
            'latest_message_at': message.created_at,
            'unread_count': 1,
        },
    )
    if not created:
        InboxEntry.objects.filter(pk=entry.pk).update(
            latest_message=message,
            latest_message_at=message.created_at,
            unread_count=F('unread_count') + 1,
        )


def _update_inbox_group_sender(message, sender, group):
    """Synchronously update just the sender's group InboxEntry. Celery handles the rest."""
    InboxEntry.objects.update_or_create(
        user=sender, conversation_type='group', group=group,
        defaults={
            'latest_message': message,
            'latest_message_at': message.created_at,
            'unread_count': 0,
        },
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user(user_id):
    from accounts.models import User
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        raise RecipientNotFoundError("User not found.")


def _check_not_self(sender, recipient_id):
    if str(sender.id) == str(recipient_id):
        raise CannotMessageSelfError("You cannot send a message to yourself.")


def _check_mutual_follow(user_a, user_b):
    """Verify both users follow each other (1 query instead of 2)."""
    from social.models import Follow
    count = Follow.objects.filter(
        Q(follower=user_a, following=user_b) | Q(follower=user_b, following=user_a)
    ).count()
    if count < 2:
        raise NotMutualFollowError("You can only message users you mutually follow.")


def _check_no_block(user_a, user_b):
    """Verify neither user has blocked the other."""
    from social.models import Block
    block_exists = Block.objects.filter(
        Q(blocker=user_a, blocked=user_b) | Q(blocker=user_b, blocked=user_a)
    ).exists()
    if block_exists:
        raise UserBlockedError("Cannot send messages due to a block between users.")


def _check_group_member(group, user):
    from groups.models import GroupMember
    if not GroupMember.objects.filter(group=group, user=user).exists():
        raise NotGroupMemberError("You must be a member of this group to send messages.")


def _get_post(post_id):
    from social.models import Post
    try:
        return Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        raise PostNotFoundError("Post not found.")


def _check_recipient_not_checked_in(recipient):
    """Raise if the recipient has already checked in today (workout, check-in, or rest day)."""
    from workouts.services.streak_service import get_streak_date, _get_local_now
    from workouts.models import Streak, RestDay
    today_streak = get_streak_date(_get_local_now(recipient))
    streak_obj = Streak.objects.filter(user=recipient).first()
    already_active = (
        streak_obj is not None and streak_obj.last_streak_date == today_streak
    )
    already_rested = RestDay.objects.filter(user=recipient, streak_date=today_streak).exists()
    if already_active or already_rested:
        raise RecipientAlreadyCheckedInError(
            f"{recipient.username} has already checked in today and can't be zapped."
        )


def _get_quick_workout(qw_id):
    from social.models import QuickWorkout
    try:
        return QuickWorkout.objects.get(id=qw_id)
    except QuickWorkout.DoesNotExist:
        raise PostNotFoundError("Check-in not found.")


def _attach_media_to_message(message, media_id, owner):
    """Link a MediaAsset to a message via MediaLink. Owner must match uploader."""
    if not media_id:
        return
    from media.models import MediaAsset, MediaLink
    try:
        asset = MediaAsset.objects.get(id=media_id, user=owner)
    except MediaAsset.DoesNotExist:
        raise MediaAssetNotFoundError("Media asset not found or does not belong to you.")
    MediaLink.objects.get_or_create(
        asset=asset,
        destination_type='message',
        destination_id=str(message.id),
        type='inline',
        defaults={'position': 0},
    )


# ---------------------------------------------------------------------------
# Send Messages
# ---------------------------------------------------------------------------

def send_zap(sender, recipient_id):
    """
    Send a zap (gym nudge) to another user via DM.
    Requires mutual follow and no blocks.
    Returns the created Message.
    """
    _check_not_self(sender, recipient_id)
    recipient = _get_user(recipient_id)
    _check_no_block(sender, recipient)
    _check_mutual_follow(sender, recipient)
    _check_recipient_not_checked_in(recipient)

    message = Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=f"\u26a1 {sender.username} zapped you! Time to hit the gym!",
    )

    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_dm(message, sender, recipient)

    # Broadcast to both participants over WebSocket, same as send_dm.
    payload = _serialize_for_ws(message, recipient_id=recipient.id)
    _broadcast(f"dm_{_clean_id(sender.id)}", payload)
    _broadcast(f"dm_{_clean_id(recipient.id)}", payload)

    # Push updated unread count to the recipient.
    _push_unread_update(recipient)

    # Push notification to recipient.
    try:
        from accounts.push import send_push_to_user
        if getattr(recipient, 'notify_zaps', True):
            send_push_to_user(
                recipient,
                title=f'⚡ @{sender.username} zapped you!',
                body='Time to hit the gym!',
                data={
                    'type': 'dm',
                    'sender_id': str(sender.id),
                    'partner_username': sender.username,
                    'partner_name': sender.display_name or sender.username,
                    'partner_avatar': sender.avatar_url or '',
                },
            )
    except Exception:
        pass

    return message


def _is_mutual_follow(user_a, user_b):
    """Check if both users follow each other (1 query instead of 2)."""
    from social.models import Follow
    count = Follow.objects.filter(
        Q(follower=user_a, following=user_b) | Q(follower=user_b, following=user_a)
    ).count()
    return count == 2


def send_dm(sender, recipient_id, content, post_id=None, quick_workout_id=None, media_id=None, profile_id=None):
    """
    Send a direct message to another user.
    If users mutually follow each other, message is sent normally.
    Otherwise, message is sent as a pending message request.
    Blocks are still enforced.
    Returns the created Message.
    """
    _check_not_self(sender, recipient_id)
    recipient = _get_user(recipient_id)
    _check_no_block(sender, recipient)

    is_request = not _is_mutual_follow(sender, recipient)

    post = _get_post(post_id) if post_id else None
    quick_workout = _get_quick_workout(quick_workout_id) if quick_workout_id else None

    shared_profile = None
    if profile_id:
        from accounts.models import User as AccountUser
        try:
            shared_profile = AccountUser.objects.get(id=profile_id)
        except AccountUser.DoesNotExist:
            pass

    message = Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=content,
        post=post,
        quick_workout=quick_workout,
        shared_profile=shared_profile,
        is_request=is_request,
    )

    _attach_media_to_message(message, media_id, owner=sender)

    # Auto-mark as read by sender
    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_dm(message, sender, recipient)

    # Broadcast to both participants over WebSocket.
    # Sender deduplicates by message ID (they already have it from the REST response).
    payload = _serialize_for_ws(message, recipient_id=recipient.id)
    _broadcast(f"dm_{_clean_id(sender.id)}", payload)
    _broadcast(f"dm_{_clean_id(recipient.id)}", payload)

    # Push updated unread count to the recipient.
    _push_unread_update(recipient)

    # Push notification to recipient.
    try:
        from accounts.push import send_push_to_user
        preview = (content or '')[:80] or '📎 Attachment'
        send_push_to_user(
            recipient,
            title=f'@{sender.username}',
            body=preview,
            data={
                'type': 'dm',
                'sender_id': str(sender.id),
                'partner_username': sender.username,
                'partner_name': sender.display_name or sender.username,
                'partner_avatar': sender.avatar_url or '',
            },
        )
    except Exception:
        pass

    return message


def send_group_zap(sender, group_id, target_user_id):
    """
    Send a zap to a specific member in a group chat.
    Both sender and target must be group members.
    Returns the created Message.
    """
    from groups.models import Group

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    _check_not_self(sender, target_user_id)
    _check_group_member(group, sender)
    target = _get_user(target_user_id)
    _check_group_member(group, target)
    _check_recipient_not_checked_in(target)

    message = Message.objects.create(
        sender=sender,
        group=group,
        content=f"\u26a1 {sender.username} zapped @{target.username}! Let's go {target.display_name or target.username}! \U0001f4aa",
    )

    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_group_sender(message, sender, group)

    payload = _serialize_for_ws(message, recipient_id=None)
    _broadcast(f"group_{_clean_id(group.id)}", payload)

    from messaging.tasks import fanout_group_inbox
    fanout_group_inbox.delay(str(message.id), str(group.id), str(sender.id))

    # Push notification to all group members except sender.
    try:
        from accounts.push import send_push_to_user
        memberships = group.members.exclude(user_id=sender.id).select_related('user')
        for membership in memberships:
            member = membership.user
            if not getattr(member, 'notify_zaps', True):
                continue
            if str(member.id) == str(target.id):
                push_title = f'⚡ @{sender.username} zapped you!'
                push_body = f'Get to the gym, {target.display_name or target.username}! 💪'
            else:
                push_title = f'{group.name}'
                push_body = f'⚡ @{sender.username} zapped @{target.username}! Let\'s go!'
            send_push_to_user(
                member,
                title=push_title,
                body=push_body,
                data={
                    'type': 'group_message',
                    'group_id': str(group.id),
                    'group_name': group.name,
                    'group_avatar': group.avatar_url or '',
                },
            )
    except Exception:
        pass

    return message


def send_system_group_message(group_id, content, join_request=None, sender=None):
    """
    Post a system message in a group chat (is_system=True).
    Used for automated events like join requests.
    Optionally links to a GroupJoinRequest so admins can act on it inline.
    sender can be set to the user who triggered the event so the frontend
    can display their username.
    Returns the created Message.
    """
    from groups.models import Group

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    return Message.objects.create(
        sender=sender,
        group=group,
        content=content,
        is_system=True,
        join_request=join_request,
    )


def ws_send_dm(sender, recipient_id, content, client_msg_id=None):
    """
    WebSocket-consumer variant of send_dm.
    Performs only DB work and returns (payload, sender_group, recipient_group, recipient_unread)
    so the async consumer can call channel_layer.group_send directly, avoiding the
    async_to_sync-inside-sync_to_async nesting that silently breaks real-time delivery.
    client_msg_id, if provided, is echoed in the payload for optimistic-render reconciliation.
    """
    _check_not_self(sender, recipient_id)
    recipient = _get_user(recipient_id)
    _check_no_block(sender, recipient)

    is_request = not _is_mutual_follow(sender, recipient)

    message = Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=content,
        is_request=is_request,
    )
    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_dm(message, sender, recipient)

    payload = _serialize_for_ws(message, recipient_id=recipient.id, client_msg_id=client_msg_id)
    sender_group = f"dm_{_clean_id(sender.id)}"
    recipient_group = f"dm_{_clean_id(recipient.id)}"
    recipient_unread = get_unread_count(recipient)

    # Push notification to recipient.
    try:
        from accounts.push import send_push_to_user
        preview = (content or '')[:80] or '📎 Attachment'
        send_push_to_user(
            recipient,
            title=f'@{sender.username}',
            body=preview,
            data={
                'type': 'dm',
                'sender_id': str(sender.id),
                'partner_username': sender.username,
                'partner_name': sender.display_name or sender.username,
                'partner_avatar': sender.avatar_url or '',
            },
        )
    except Exception:
        pass

    return payload, sender_group, recipient_group, recipient_unread


def ws_send_group_message(sender, group_id, content, client_msg_id=None):
    """
    WebSocket-consumer variant of send_group_message.
    Returns (payload, group_channel, member_dm_groups) where member_dm_groups is a dict
    mapping each non-sender member's personal DM group name to their new unread counts,
    so the async consumer can push unread_update events without async_to_sync nesting.
    client_msg_id, if provided, is echoed in the payload for optimistic-render reconciliation.
    """
    from groups.models import Group, GroupMember

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    _check_group_member(group, sender)

    message = Message.objects.create(
        sender=sender,
        group=group,
        content=content,
    )
    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_group_sender(message, sender, group)

    payload = _serialize_for_ws(message, recipient_id=None, client_msg_id=client_msg_id)
    group_channel = f"group_{_clean_id(group.id)}"

    from messaging.tasks import fanout_group_inbox
    fanout_group_inbox.delay(str(message.id), str(group.id), str(sender.id))

    # Return empty dict — Celery now handles the per-member unread pushes
    member_dm_groups = {}

    # Push notification to all group members except sender.
    try:
        from accounts.push import send_push_to_user
        preview = (content or '')[:80] or '📎 Attachment'
        memberships = group.members.exclude(user_id=sender.id).select_related('user')
        for membership in memberships:
            send_push_to_user(
                membership.user,
                title=f'{group.name}: @{sender.username}',
                body=preview,
                data={
                    'type': 'group_message',
                    'group_id': str(group.id),
                    'group_name': group.name,
                    'group_avatar': group.avatar_url or '',
                },
            )
    except Exception:
        pass

    return payload, group_channel, member_dm_groups


def send_group_message(sender, group_id, content, post_id=None, quick_workout_id=None, media_id=None, profile_id=None):
    """
    Send a message in a group chat.
    Sender must be a group member.
    Optionally attach a shared post or check-in.
    Returns the created Message.
    """
    from groups.models import Group

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    _check_group_member(group, sender)

    post = _get_post(post_id) if post_id else None
    quick_workout = _get_quick_workout(quick_workout_id) if quick_workout_id else None

    shared_profile = None
    if profile_id:
        from accounts.models import User as AccountUser
        try:
            shared_profile = AccountUser.objects.get(id=profile_id)
        except AccountUser.DoesNotExist:
            pass

    message = Message.objects.create(
        sender=sender,
        group=group,
        content=content,
        post=post,
        quick_workout=quick_workout,
        shared_profile=shared_profile,
    )

    _attach_media_to_message(message, media_id, owner=sender)

    # Auto-mark as read by sender
    MessageRead.objects.create(message=message, user=sender)
    _update_inbox_group_sender(message, sender, group)

    # Broadcast to all group members over WebSocket.
    payload = _serialize_for_ws(message, recipient_id=None)
    _broadcast(f"group_{_clean_id(group.id)}", payload)

    from messaging.tasks import fanout_group_inbox
    fanout_group_inbox.delay(str(message.id), str(group.id), str(sender.id))

    # Push notification to all group members except sender.
    try:
        from accounts.push import send_push_to_user
        preview = (content or '')[:80] or '📎 Attachment'
        memberships = group.members.exclude(user_id=sender.id).select_related('user')
        for membership in memberships:
            send_push_to_user(
                membership.user,
                title=f'{group.name}: @{sender.username}',
                body=preview,
                data={
                    'type': 'group_message',
                    'group_id': str(group.id),
                    'group_name': group.name,
                    'group_avatar': group.avatar_url or '',
                },
            )
    except Exception:
        pass

    return message


# ---------------------------------------------------------------------------
# Conversations List
# ---------------------------------------------------------------------------

def list_dm_conversations(user):
    """
    Return InboxEntry queryset for all DM conversations, ordered by latest_message_at.
    O(conversations) read — no correlated subqueries.
    """
    return (
        InboxEntry.objects
        .filter(user=user, conversation_type='dm', latest_message__isnull=False)
        .select_related('partner', 'latest_message__sender',
                        'latest_message__post', 'latest_message__quick_workout',
                        'latest_message__shared_profile')
        .order_by('-latest_message_at')
    )


def list_group_conversations(user):
    """
    Return InboxEntry queryset for all group conversations, ordered by latest_message_at.
    O(conversations) read — no correlated subqueries.
    """
    from django.db.models import Count
    return (
        InboxEntry.objects
        .filter(user=user, conversation_type='group')
        .select_related('group', 'latest_message__sender')
        .annotate(member_count=Count('group__members'))
        .order_by('-latest_message_at')
    )


# ---------------------------------------------------------------------------
# Unread Count Helpers (batch — one query each, no per-conversation loop)
# ---------------------------------------------------------------------------

def get_dm_unread_map(user):
    """
    Return a dict of {partner_id (str): unread_count} from InboxEntry.
    """
    return {
        str(row['partner_id']): row['unread_count']
        for row in InboxEntry.objects.filter(user=user, conversation_type='dm')
                              .values('partner_id', 'unread_count')
    }


def get_group_unread_map(user, group_ids):
    """
    Return a dict of {group_id (str): unread_count} from InboxEntry.
    """
    return {
        str(row['group_id']): row['unread_count']
        for row in InboxEntry.objects.filter(user=user, group_id__in=group_ids)
                              .values('group_id', 'unread_count')
    }


# ---------------------------------------------------------------------------
# Message History  (cursor-based pagination)
# ---------------------------------------------------------------------------

def get_dm_messages(user, partner_id, limit=50, before_id=None, after_id=None):
    """
    Cursor-based message history between user and partner.

    - Default (no cursor): returns the most recent `limit` messages, newest first.
    - before_id: returns up to `limit` messages older than that message, newest first.
      Use this for infinite-scroll upward (pass oldest_id from previous response).
    - after_id: returns up to `limit` messages newer than that message, oldest first.
      Use this for polling / incremental sync (pass newest_id from previous response).

    Returns: (messages list, has_more bool)
    """
    _check_not_self(user, partner_id)
    partner = _get_user(partner_id)
    _check_no_block(user, partner)
    _check_mutual_follow(user, partner)

    base_qs = Message.objects.filter(
        Q(sender=user, recipient=partner) | Q(sender=partner, recipient=user)
    ).select_related('sender', 'post__user', 'quick_workout__user', 'quick_workout__location', 'shared_profile').prefetch_related(
        Prefetch(
            'read_receipts',
            queryset=MessageRead.objects.filter(user=user),
            to_attr='user_read_receipts',
        ),
        Prefetch(
            'reactions',
            queryset=MessageReaction.objects.select_related('user'),
            to_attr='prefetched_reactions',
        ),
    )

    if before_id:
        try:
            cursor = Message.objects.values('created_at', 'id').get(id=before_id)
        except Message.DoesNotExist:
            raise MessageNotFoundError("Cursor message not found.")
        base_qs = base_qs.filter(
            Q(created_at__lt=cursor['created_at'])
            | Q(created_at=cursor['created_at'], id__lt=cursor['id'])
        )
        # Fetch newest-first (so LIMIT grabs the closest older messages), then reverse
        # to return oldest-first so the client can prepend them in correct order.
        chunk = list(base_qs.order_by('-created_at', '-id')[:limit + 1])
        has_more = len(chunk) > limit
        return list(reversed(chunk[:limit])), has_more

    if after_id:
        try:
            cursor = Message.objects.values('created_at', 'id').get(id=after_id)
        except Message.DoesNotExist:
            raise MessageNotFoundError("Cursor message not found.")
        base_qs = base_qs.filter(
            Q(created_at__gt=cursor['created_at'])
            | Q(created_at=cursor['created_at'], id__gt=cursor['id'])
        )
        # Oldest-first so the client can append in order and use the last id as next cursor
        messages = list(base_qs.order_by('created_at', 'id')[:limit + 1])
        has_more = len(messages) > limit
        return messages[:limit], has_more

    # Default: fetch the latest N messages newest-first, then reverse to oldest-first
    # so the client renders them top-to-bottom and scrolls to the bottom to see newest.
    chunk = list(base_qs.order_by('-created_at', '-id')[:limit + 1])
    has_more = len(chunk) > limit
    return list(reversed(chunk[:limit])), has_more


def get_group_messages(user, group_id, limit=50, before_id=None, after_id=None):
    """
    Cursor-based message history for a group chat.

    - Default (no cursor): returns the most recent `limit` messages, newest first.
    - before_id: older messages (scroll up).
    - after_id: newer messages (incremental sync), oldest first.

    Returns: (messages list, has_more bool)
    """
    from groups.models import Group

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    _check_group_member(group, user)

    base_qs = Message.objects.filter(group=group).select_related('sender', 'post__user', 'quick_workout__user', 'quick_workout__location', 'shared_profile', 'join_request').prefetch_related(
        Prefetch(
            'read_receipts',
            queryset=MessageRead.objects.filter(user=user),
            to_attr='user_read_receipts',
        ),
        Prefetch(
            'reactions',
            queryset=MessageReaction.objects.select_related('user'),
            to_attr='prefetched_reactions',
        ),
    )

    if before_id:
        try:
            cursor = Message.objects.values('created_at', 'id').get(id=before_id)
        except Message.DoesNotExist:
            raise MessageNotFoundError("Cursor message not found.")
        base_qs = base_qs.filter(
            Q(created_at__lt=cursor['created_at'])
            | Q(created_at=cursor['created_at'], id__lt=cursor['id'])
        )
        chunk = list(base_qs.order_by('-created_at', '-id')[:limit + 1])
        has_more = len(chunk) > limit
        return list(reversed(chunk[:limit])), has_more

    if after_id:
        try:
            cursor = Message.objects.values('created_at', 'id').get(id=after_id)
        except Message.DoesNotExist:
            raise MessageNotFoundError("Cursor message not found.")
        base_qs = base_qs.filter(
            Q(created_at__gt=cursor['created_at'])
            | Q(created_at=cursor['created_at'], id__gt=cursor['id'])
        )
        messages = list(base_qs.order_by('created_at', 'id')[:limit + 1])
        has_more = len(messages) > limit
        return messages[:limit], has_more

    chunk = list(base_qs.order_by('-created_at', '-id')[:limit + 1])
    has_more = len(chunk) > limit
    return list(reversed(chunk[:limit])), has_more


# ---------------------------------------------------------------------------
# Read Receipts
# ---------------------------------------------------------------------------

def mark_messages_as_read(user, message_ids):
    """
    Mark a list of messages as read by the user.
    Silently skips messages that are already read or don't exist.
    Returns the number of new read receipts created.
    """
    # Only mark messages the user has access to
    accessible = Message.objects.filter(
        Q(recipient=user) | Q(group__members__user=user),
        id__in=message_ids,
    ).values_list('id', flat=True)

    already_read = set(
        MessageRead.objects.filter(
            user=user, message_id__in=accessible
        ).values_list('message_id', flat=True)
    )

    to_create = [
        MessageRead(message_id=mid, user=user)
        for mid in accessible if mid not in already_read
    ]

    if to_create:
        MessageRead.objects.bulk_create(to_create, ignore_conflicts=True)

    # Zero out InboxEntry unread for affected conversations
    accessible_ids = list(accessible)
    rows = list(Message.objects.filter(id__in=accessible_ids)
                .values('sender_id', 'recipient_id', 'group_id'))
    partner_ids = {row['sender_id'] for row in rows
                   if row.get('recipient_id') and str(row['recipient_id']) == str(user.id)}
    group_ids = {row['group_id'] for row in rows if row.get('group_id')}
    if partner_ids:
        InboxEntry.objects.filter(user=user, conversation_type='dm',
                                  partner_id__in=partner_ids).update(unread_count=0)
    if group_ids:
        InboxEntry.objects.filter(user=user, conversation_type='group',
                                  group_id__in=group_ids).update(unread_count=0)

    return len(to_create)


def get_unread_count(user):
    """
    Get total unread count for the user (DMs + group messages + org announcements).
    Reads InboxEntry for messages (O(1)) and OrgMember for announcements.
    """
    from django.db.models import Sum, Q as DQ
    result = InboxEntry.objects.filter(user=user).aggregate(
        dm=Sum('unread_count', filter=DQ(conversation_type='dm'), default=0),
        group=Sum('unread_count', filter=DQ(conversation_type='group'), default=0),
    )
    dm = result['dm'] or 0
    group = result['group'] or 0

    # Count unread org announcements (only for orgs the user has visited before).
    # If last_announcements_read_at is null, we treat as 0 to avoid a huge initial badge.
    from organizations.models import OrgMember, Announcement
    from django.db.models import Q
    memberships = list(
        OrgMember.objects.filter(user=user, last_announcements_read_at__isnull=False)
        .values('org_id', 'last_announcements_read_at')
    )
    org = 0
    if memberships:
        unread_q = Q()
        for m in memberships:
            unread_q |= Q(org_id=m['org_id'], created_at__gt=m['last_announcements_read_at'])
        org = Announcement.objects.filter(unread_q).exclude(author=user).count()

    # Add pending join requests for orgs where user is admin/creator
    from organizations.models import OrgMember as OM, OrgJoinRequest as JR
    admin_org_ids = list(
        OM.objects.filter(
            user=user,
            role__in=(OM.Role.ADMIN, OM.Role.CREATOR),
        ).values_list('org_id', flat=True)
    )
    if admin_org_ids:
        org += JR.objects.filter(org_id__in=admin_org_ids, status=JR.Status.PENDING).count()

    return {'dm': dm, 'group': group, 'org': org, 'total': dm + group + org}


# ---------------------------------------------------------------------------
# Message Reactions
# ---------------------------------------------------------------------------

def toggle_message_reaction(user, message_id, emoji):
    """
    Toggle an emoji reaction on a message.
    The user must be the sender, recipient, or a group member.
    Returns (reaction_or_None, created: bool).
    """
    from django.db.models import Q as DQ
    try:
        message = Message.objects.get(id=message_id)
    except Message.DoesNotExist:
        raise MessageNotFoundError("Message not found.")

    # Access check: must be sender, recipient (DM), or a group member
    is_sender = message.sender_id and str(message.sender_id) == str(user.id)
    is_recipient = message.recipient_id and str(message.recipient_id) == str(user.id)
    is_group_member = False
    if message.group_id:
        from groups.models import GroupMember
        is_group_member = GroupMember.objects.filter(group_id=message.group_id, user=user).exists()

    if not (is_sender or is_recipient or is_group_member):
        raise ConversationNotFoundError("You do not have access to this message.")

    reaction, created = MessageReaction.objects.get_or_create(
        message=message, user=user, emoji=emoji,
    )
    if not created:
        reaction.delete()
        return None, False

    return reaction, True


def get_message_reactions(message, user):
    """Return grouped reaction summary for a message."""
    from django.db.models import Count
    rows = (
        MessageReaction.objects
        .filter(message=message)
        .values('emoji')
        .annotate(count=Count('id'))
        .order_by('-count', 'emoji')
    )
    user_emojis = set(
        MessageReaction.objects
        .filter(message=message, user=user)
        .values_list('emoji', flat=True)
    )
    return [
        {'emoji': r['emoji'], 'count': r['count'], 'user_reacted': r['emoji'] in user_emojis}
        for r in rows
    ]


def update_reaction_inbox_preview(message, reactor):
    """
    Update the reaction preview fields on InboxEntry rows for all conversation participants.
    Called after every reaction toggle (add or remove).

    If at least one reaction still exists on the message, store the reactor's username,
    the message sender's ID, and now() as the reaction timestamp so the serializer can
    show "alice reacted to your message" / "alice reacted to a message".

    If no reactions remain (user toggled off the last one), clear all three fields so the
    conversation preview falls back to the normal latest_message preview.
    """
    from django.utils import timezone

    has_reactions = MessageReaction.objects.filter(message=message).exists()

    if has_reactions:
        actor = reactor.username
        msg_sender_id = str(message.sender_id) if message.sender_id else ''
        reacted_at = timezone.now()

        update_kwargs = {
            'latest_reaction_actor': actor,
            'latest_reaction_message_sender_id': msg_sender_id,
            'latest_reaction_at': reacted_at,
        }
    else:
        update_kwargs = {
            'latest_reaction_actor': '',
            'latest_reaction_message_sender_id': '',
            'latest_reaction_at': None,
        }

    if message.group_id:
        InboxEntry.objects.filter(
            conversation_type='group', group_id=message.group_id
        ).update(**update_kwargs)
    elif message.sender_id and message.recipient_id:
        InboxEntry.objects.filter(
            conversation_type='dm',
        ).filter(
            Q(user_id=message.sender_id, partner_id=message.recipient_id)
            | Q(user_id=message.recipient_id, partner_id=message.sender_id)
        ).update(**update_kwargs)


def broadcast_reaction_update(message):
    """
    Broadcast updated reaction state for a message to all conversation participants.
    Includes reactor_ids so each client can compute its own user_reacted flag.
    """
    from collections import defaultdict
    from django.db.models import Count

    # Build per-emoji reactor ID lists in a single query
    reactor_map = defaultdict(list)
    for r in MessageReaction.objects.filter(message=message).values('emoji', 'user_id'):
        reactor_map[r['emoji']].append(str(r['user_id']))

    rows = (
        MessageReaction.objects
        .filter(message=message)
        .values('emoji')
        .annotate(count=Count('id'))
        .order_by('-count', 'emoji')
    )
    reactions = [
        {'emoji': r['emoji'], 'count': r['count'], 'reactor_ids': reactor_map[r['emoji']]}
        for r in rows
    ]

    payload = {
        'type': 'reaction_update',
        'message_id': str(message.id),
        'reactions': reactions,
    }

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        if message.group_id:
            async_to_sync(channel_layer.group_send)(
                f"group_{_clean_id(message.group_id)}", payload
            )
        elif message.sender_id and message.recipient_id:
            async_to_sync(channel_layer.group_send)(
                f"dm_{_clean_id(message.sender_id)}", payload
            )
            async_to_sync(channel_layer.group_send)(
                f"dm_{_clean_id(message.recipient_id)}", payload
            )
    except Exception as exc:
        logger.warning("WS reaction broadcast for message %s failed: %s", message.id, exc)
