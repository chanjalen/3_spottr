from django.db.models import Q, Max, Count, Subquery, OuterRef
from django.db.models import Prefetch

from .models import Message, MessageRead
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
    """Verify both users follow each other."""
    from social.models import Follow
    a_follows_b = Follow.objects.filter(follower=user_a, following=user_b).exists()
    b_follows_a = Follow.objects.filter(follower=user_b, following=user_a).exists()
    if not (a_follows_b and b_follows_a):
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
    from workouts.services.streak_service import get_streak_date
    from workouts.models import Streak, RestDay
    today_streak = get_streak_date()
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
    return message


def _is_mutual_follow(user_a, user_b):
    """Check if both users follow each other."""
    from social.models import Follow
    a_follows_b = Follow.objects.filter(follower=user_a, following=user_b).exists()
    b_follows_a = Follow.objects.filter(follower=user_b, following=user_a).exists()
    return a_follows_b and b_follows_a


def send_dm(sender, recipient_id, content, post_id=None, quick_workout_id=None):
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

    message = Message.objects.create(
        sender=sender,
        recipient=recipient,
        content=content,
        post=post,
        quick_workout=quick_workout,
        is_request=is_request,
    )

    # Auto-mark as read by sender
    MessageRead.objects.create(message=message, user=sender)

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


def send_group_message(sender, group_id, content, post_id=None, quick_workout_id=None):
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

    message = Message.objects.create(
        sender=sender,
        group=group,
        content=content,
        post=post,
        quick_workout=quick_workout,
    )

    # Auto-mark as read by sender
    MessageRead.objects.create(message=message, user=sender)

    return message


# ---------------------------------------------------------------------------
# Conversations List
# ---------------------------------------------------------------------------

def list_dm_conversations(user):
    """
    Return a list of users the authenticated user has DM conversations with,
    along with the latest message in each conversation.

    Uses a correlated subquery per partner so the DB does the work in one
    round-trip instead of firing one query per conversation partner.
    """
    from accounts.models import User

    # Collect all unique partner IDs (one query each direction, both cheap)
    sent_partner_ids = set(
        Message.objects.filter(sender=user, recipient__isnull=False)
        .values_list('recipient_id', flat=True)
    )
    recv_partner_ids = set(
        Message.objects.filter(recipient=user)
        .values_list('sender_id', flat=True)
    )
    partner_ids = sent_partner_ids | recv_partner_ids

    if not partner_ids:
        return Message.objects.none()

    # For each partner, get the id of the most recent message using a
    # correlated subquery — one server-side index scan per partner.
    latest_msg_subq = Message.objects.filter(
        Q(sender=user, recipient=OuterRef('pk'))
        | Q(sender=OuterRef('pk'), recipient=user)
    ).order_by('-created_at', '-id').values('id')[:1]

    latest_msg_ids = list(
        User.objects.filter(id__in=partner_ids)
        .annotate(latest_msg_id=Subquery(latest_msg_subq))
        .values_list('latest_msg_id', flat=True)
    )
    latest_msg_ids = [mid for mid in latest_msg_ids if mid is not None]

    return (
        Message.objects.filter(id__in=latest_msg_ids)
        .select_related('sender', 'recipient', 'post', 'quick_workout')
        .order_by('-created_at')
    )


def list_group_conversations(user):
    """
    Return groups the user is a member of that have messages,
    along with the latest message per group.

    Uses a correlated subquery so one DB round-trip replaces the previous
    Max('id') approach (which was wrong for UUID strings).
    """
    from groups.models import Group, GroupMember

    group_ids = list(
        GroupMember.objects.filter(user=user).values_list('group_id', flat=True)
    )

    if not group_ids:
        return Message.objects.none()

    # For each group, get the id of the most recent message
    latest_msg_subq = Message.objects.filter(
        group_id=OuterRef('id')
    ).order_by('-created_at', '-id').values('id')[:1]

    latest_msg_ids = list(
        Group.objects.filter(id__in=group_ids)
        .annotate(latest_msg_id=Subquery(latest_msg_subq))
        .values_list('latest_msg_id', flat=True)
    )
    latest_msg_ids = [mid for mid in latest_msg_ids if mid is not None]

    return (
        Message.objects.filter(id__in=latest_msg_ids)
        .select_related('sender', 'group', 'post', 'quick_workout')
        .order_by('-created_at')
    )


# ---------------------------------------------------------------------------
# Unread Count Helpers (batch — one query each, no per-conversation loop)
# ---------------------------------------------------------------------------

def get_dm_unread_map(user):
    """
    Return a dict of {sender_id (str): unread_count} for DM messages.
    Single aggregation query replaces the per-conversation count loop.
    """
    rows = (
        Message.objects.filter(recipient=user)
        .exclude(read_receipts__user=user)
        .values('sender_id')
        .annotate(count=Count('id'))
    )
    return {str(row['sender_id']): row['count'] for row in rows}


def get_group_unread_map(user, group_ids):
    """
    Return a dict of {group_id (str): unread_count} for group messages.
    Single aggregation query replaces the per-group count loop.
    """
    rows = (
        Message.objects.filter(group_id__in=group_ids)
        .exclude(sender=user)
        .exclude(read_receipts__user=user)
        .values('group_id')
        .annotate(count=Count('id'))
    )
    return {str(row['group_id']): row['count'] for row in rows}


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
    ).select_related('sender', 'post__user', 'quick_workout__user', 'quick_workout__location').prefetch_related(
        Prefetch(
            'read_receipts',
            queryset=MessageRead.objects.filter(user=user),
            to_attr='user_read_receipts',
        )
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

    base_qs = Message.objects.filter(group=group).select_related('sender', 'post__user', 'quick_workout__user', 'quick_workout__location', 'join_request').prefetch_related(
        Prefetch(
            'read_receipts',
            queryset=MessageRead.objects.filter(user=user),
            to_attr='user_read_receipts',
        )
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

    return len(to_create)


def get_unread_count(user):
    """
    Get total unread message count for the user (DMs + group messages).
    """
    dm_unread = Message.objects.filter(
        recipient=user,
    ).exclude(
        read_receipts__user=user,
    ).count()

    from groups.models import GroupMember
    group_ids = GroupMember.objects.filter(user=user).values_list('group_id', flat=True)

    group_unread = Message.objects.filter(
        group_id__in=group_ids,
    ).exclude(
        sender=user,
    ).exclude(
        read_receipts__user=user,
    ).count()

    return {
        'dm': dm_unread,
        'group': group_unread,
        'total': dm_unread + group_unread,
    }
