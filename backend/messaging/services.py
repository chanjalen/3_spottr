from django.db.models import Q, Max, Subquery, OuterRef

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
    Returns a queryset of Messages (the latest message per conversation partner).
    """
    # Get all DM messages involving the user
    user_dms = Message.objects.filter(
        Q(sender=user, recipient__isnull=False) |
        Q(recipient=user)
    )

    if not user_dms.exists():
        return Message.objects.none()

    # For each conversation partner, get the latest message ID
    # We need to figure out the "other user" for each message
    # Approach: get latest message per unique partner
    sent = (
        Message.objects.filter(sender=user, recipient__isnull=False)
        .values('recipient')
        .annotate(latest=Max('created_at'))
    )
    received = (
        Message.objects.filter(recipient=user)
        .values('sender')
        .annotate(latest=Max('created_at'))
    )

    # Build a dict of partner_id -> latest timestamp
    partner_latest = {}
    for entry in sent:
        pid = entry['recipient']
        ts = entry['latest']
        if pid not in partner_latest or ts > partner_latest[pid]:
            partner_latest[pid] = ts

    for entry in received:
        pid = entry['sender']
        ts = entry['latest']
        if pid not in partner_latest or ts > partner_latest[pid]:
            partner_latest[pid] = ts

    # For each partner, get the actual latest message
    message_ids = []
    for partner_id, latest_ts in partner_latest.items():
        msg = Message.objects.filter(
            Q(sender=user, recipient_id=partner_id) |
            Q(sender_id=partner_id, recipient=user),
            created_at=latest_ts,
        ).first()
        if msg:
            message_ids.append(msg.id)

    return Message.objects.filter(id__in=message_ids).select_related('post__user', 'quick_workout__user', 'quick_workout__location').order_by('-created_at')


def list_group_conversations(user):
    """
    Return groups the user is a member of that have messages,
    along with the latest message per group.
    Returns a queryset of Messages (latest per group).
    """
    from groups.models import GroupMember

    group_ids = GroupMember.objects.filter(user=user).values_list('group_id', flat=True)

    if not group_ids:
        return Message.objects.none()

    # Get latest message per group
    latest_per_group = (
        Message.objects.filter(group_id__in=group_ids)
        .values('group_id')
        .annotate(latest=Max('id'))
    )

    message_ids = [entry['latest'] for entry in latest_per_group]
    return Message.objects.filter(id__in=message_ids).select_related('post__user', 'quick_workout__user', 'quick_workout__location').order_by('-created_at')


# ---------------------------------------------------------------------------
# Message History
# ---------------------------------------------------------------------------

def get_dm_messages(user, partner_id, limit=50, offset=0):
    """
    Get messages between user and a partner (both directions).
    Returns a queryset of Messages ordered oldest-first.
    """
    _check_not_self(user, partner_id)
    partner = _get_user(partner_id)

    # Verify mutual follow to view conversation
    _check_no_block(user, partner)
    _check_mutual_follow(user, partner)

    messages = Message.objects.filter(
        Q(sender=user, recipient=partner) |
        Q(sender=partner, recipient=user)
    ).select_related('post__user', 'quick_workout__user', 'quick_workout__location').order_by('created_at')

    return messages[offset:offset + limit]


def get_group_messages(user, group_id, limit=50, offset=0):
    """
    Get messages in a group chat. User must be a member.
    Returns a queryset of Messages ordered oldest-first.
    """
    from groups.models import Group

    try:
        group = Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise ConversationNotFoundError("Group not found.")

    _check_group_member(group, user)

    messages = Message.objects.filter(group=group).select_related('post__user', 'quick_workout__user', 'quick_workout__location').order_by('created_at')
    return messages[offset:offset + limit]


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
    # All messages where user is recipient (DM) or in the group, minus already read
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
        sender=user,  # Don't count own messages
    ).exclude(
        read_receipts__user=user,
    ).count()

    return {
        'dm': dm_unread,
        'group': group_unread,
        'total': dm_unread + group_unread,
    }
