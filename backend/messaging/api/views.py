from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.throttles import MessageRateThrottle, ZapRateThrottle, ReactionRateThrottle  # noqa: re-exported

from messaging import services
from messaging.serializers import (
    MessageSerializer,
    MessageListSerializer,
    ConversationSerializer,
    GroupConversationSerializer,
    UnreadCountSerializer,
    SendDMSerializer,
    SendGroupMessageSerializer,
    MarkReadSerializer,
    ReactMessageSerializer,
)
from messaging.exceptions import (
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


# ---------------------------------------------------------------------------
# Send Messages
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ZapRateThrottle])
def send_zap(request, recipient_id):
    """Send a zap (gym nudge) to another user. Creates a special DM message."""
    try:
        message = services.send_zap(request.user, recipient_id)
    except CannotMessageSelfError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except RecipientNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except UserBlockedError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except NotMutualFollowError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except RecipientAlreadyCheckedInError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        MessageSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([MessageRateThrottle])
def send_dm(request):
    """Send a direct message to another user."""
    serializer = SendDMSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        message = services.send_dm(
            sender=request.user,
            recipient_id=serializer.validated_data['recipient_id'],
            content=serializer.validated_data['content'],
            post_id=serializer.validated_data.get('post_id'),
            quick_workout_id=serializer.validated_data.get('quick_workout_id'),
            media_id=serializer.validated_data.get('media_id'),
        )
    except CannotMessageSelfError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except RecipientNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except UserBlockedError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except NotMutualFollowError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except PostNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except MediaAssetNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        MessageSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ZapRateThrottle])
def send_group_zap(request, group_id, target_user_id):
    """Send a zap to a specific member in a group chat."""
    try:
        message = services.send_group_zap(request.user, group_id, target_user_id)
    except CannotMessageSelfError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except RecipientNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    return Response(
        MessageListSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([MessageRateThrottle])
def send_group_message(request, group_id):
    """Send a message in a group chat."""
    serializer = SendGroupMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        message = services.send_group_message(
            sender=request.user,
            group_id=group_id,
            content=serializer.validated_data['content'],
            post_id=serializer.validated_data.get('post_id'),
            quick_workout_id=serializer.validated_data.get('quick_workout_id'),
            media_id=serializer.validated_data.get('media_id'),
        )
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except PostNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except MediaAssetNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        MessageListSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_avatar_map(user_ids):
    """
    Bulk-fetch user avatar URLs for all user_ids in one query.
    Returns a dict mapping str(user_id) → url string.
    """
    from media.models import MediaLink
    ids = [str(uid) for uid in user_ids if uid is not None]
    if not ids:
        return {}
    links = (
        MediaLink.objects
        .filter(destination_type='user', destination_id__in=ids, type='avatar')
        .select_related('asset')
    )
    return {link.destination_id: link.asset.url for link in links}


def _build_media_map(destination_type, items):
    """
    Bulk-fetch MediaLink rows for all items in one query.
    Returns a dict mapping str(item.id) → list of media dicts.
    """
    from media.models import MediaLink
    from django.conf import settings
    ids = [str(m.id) for m in items]
    if not ids:
        return {}
    links = (
        MediaLink.objects
        .filter(destination_type=destination_type, destination_id__in=ids, type='inline')
        .select_related('asset')
        .order_by('destination_id', 'position')
    )
    media_map = {}
    for link in links:
        asset = link.asset
        thumbnail_url = (
            f"{settings.MEDIA_URL}{asset.thumbnail_key}" if asset.thumbnail_key else None
        )
        media_map.setdefault(link.destination_id, []).append({
            'url': asset.url, 'kind': asset.kind,
            'thumbnail_url': thumbnail_url,
            'width': asset.width, 'height': asset.height,
        })
    return media_map


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

def _get_activity_map(partner_ids):
    """
    Batch lookup: returns a dict mapping str(user_id) → bool (has activity today).
    Fires exactly 2 queries regardless of how many partners there are.
    """
    from workouts.services.streak_service import get_streak_date
    from workouts.models import Streak, RestDay
    today = get_streak_date()
    active = set(
        Streak.objects
        .filter(user_id__in=partner_ids, last_streak_date=today)
        .values_list('user_id', flat=True)
    )
    rested = set(
        RestDay.objects
        .filter(user_id__in=partner_ids, streak_date=today)
        .values_list('user_id', flat=True)
    )
    return {str(pid): (pid in active or pid in rested) for pid in partner_ids}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dm_conversations(request):
    """
    List all DM conversations with the latest message per partner.
    Reads directly from InboxEntry — no correlated subqueries or separate unread query.
    """
    entries = list(services.list_dm_conversations(request.user))

    partner_ids = [entry.partner_id for entry in entries]
    activity_map = _get_activity_map(partner_ids)

    conversations = []
    for entry in entries:
        conversations.append({
            'partner_id': str(entry.partner_id),
            'partner_username': entry.partner.username,
            'partner_display_name': entry.partner.display_name or entry.partner.username,
            'partner_avatar_url': entry.partner.avatar_url or None,
            'latest_message': entry.latest_message,
            'unread_count': entry.unread_count,
            'partner_has_activity_today': activity_map.get(str(entry.partner_id), False),
        })

    serializer = ConversationSerializer(
        conversations, many=True, context={'request': request}
    )
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_conversations(request):
    """
    List all group conversations with the latest message per group.
    Reads directly from InboxEntry — no correlated subqueries or separate unread query.
    """
    entries = services.list_group_conversations(request.user)

    conversations = []
    for entry in entries:
        conversations.append({
            'group_id': str(entry.group_id),
            'group_name': entry.group.name,
            'group_streak': entry.group.group_streak,
            'avatar_url': entry.group.avatar_url or None,
            'member_count': entry.member_count,
            'latest_message': entry.latest_message,
            'unread_count': entry.unread_count,
        })

    serializer = GroupConversationSerializer(
        conversations, many=True, context={'request': request}
    )
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Message History  (cursor-based pagination)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dm_messages(request, partner_id):
    """
    Cursor-based DM message history.

    Query params:
      ?before_id=<id>  — load messages older than this (scroll up / infinite scroll)
      ?after_id=<id>   — load messages newer than this (polling / realtime sync)
      ?limit=<n>       — page size, default 10, max 100

    Response:
      messages    — newest-first (before_id/default) or oldest-first (after_id)
      has_more    — true if more messages exist in that direction
      oldest_id   — id of the oldest message in this page (use as before_id to scroll up)
      newest_id   — id of the newest message in this page (use as after_id to poll)
    """
    limit = min(int(request.query_params.get('limit', 20)), 100)
    before_id = request.query_params.get('before_id')
    after_id = request.query_params.get('after_id')

    try:
        messages, has_more = services.get_dm_messages(
            request.user, partner_id,
            limit=limit, before_id=before_id, after_id=after_id,
        )
    except CannotMessageSelfError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except RecipientNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except UserBlockedError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except NotMutualFollowError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except MessageNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    media_map = _build_media_map('message', messages)
    sender_ids = {m.sender_id for m in messages}
    sender_avatar_map = _build_avatar_map(sender_ids)
    serializer = MessageListSerializer(messages, many=True, context={
        'request': request, 'media_map': media_map, 'sender_avatar_map': sender_avatar_map,
    })

    # Messages are always returned oldest-first. oldest_id = messages[0], newest_id = messages[-1].
    oldest_id = str(messages[0].id) if messages else None
    newest_id = str(messages[-1].id) if messages else None

    return Response({
        'results': serializer.data,   # 'results' matches the existing frontend expectation
        'has_more': has_more,
        'oldest_id': oldest_id,       # pass as ?before_id= to load older messages
        'newest_id': newest_id,       # pass as ?after_id= to poll for new messages
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_messages(request, group_id):
    """
    Cursor-based group message history.

    Query params:
      ?before_id=<id>  — load messages older than this (scroll up / infinite scroll)
      ?after_id=<id>   — load messages newer than this (polling / realtime sync)
      ?limit=<n>       — page size, default 10, max 100

    Response:
      messages    — newest-first (before_id/default) or oldest-first (after_id)
      has_more    — true if more messages exist in that direction
      oldest_id   — id of the oldest message in this page (use as before_id to scroll up)
      newest_id   — id of the newest message in this page (use as after_id to poll)
    """
    limit = min(int(request.query_params.get('limit', 20)), 100)
    before_id = request.query_params.get('before_id')
    after_id = request.query_params.get('after_id')

    try:
        messages, has_more = services.get_group_messages(
            request.user, group_id,
            limit=limit, before_id=before_id, after_id=after_id,
        )
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except MessageNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    media_map = _build_media_map('message', messages)
    sender_ids = {m.sender_id for m in messages}
    sender_avatar_map = _build_avatar_map(sender_ids)
    serializer = MessageListSerializer(messages, many=True, context={
        'request': request, 'media_map': media_map, 'sender_avatar_map': sender_avatar_map,
    })

    oldest_id = str(messages[0].id) if messages else None
    newest_id = str(messages[-1].id) if messages else None

    return Response({
        'results': serializer.data,
        'has_more': has_more,
        'oldest_id': oldest_id,
        'newest_id': newest_id,
    })


# ---------------------------------------------------------------------------
# Read Receipts
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read(request):
    """Mark messages as read. Body: {"message_ids": ["id1", "id2"]}"""
    serializer = MarkReadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    count = services.mark_messages_as_read(
        request.user,
        serializer.validated_data['message_ids'],
    )
    return Response({"marked_read": count})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count(request):
    """Get unread message counts (DM, group, total)."""
    counts = services.get_unread_count(request.user)
    serializer = UnreadCountSerializer(counts)
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Message Reactions
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def message_reaction_details(request, message_id):
    """
    Return the full list of who reacted to a message.
    Response: [{ emoji, username, display_name, avatar_url }]
    Only accessible to participants of the conversation (DM partner or group member).
    """
    from messaging.models import Message, MessageReaction
    try:
        message = Message.objects.select_related('sender', 'recipient', 'group').get(id=message_id)
    except Message.DoesNotExist:
        return Response({"error": "Message not found."}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    # Access check: must be DM participant or group member
    if message.group_id:
        from groups.models import GroupMember
        if not GroupMember.objects.filter(group_id=message.group_id, user=user).exists():
            return Response({"error": "Not a group member."}, status=status.HTTP_403_FORBIDDEN)
    else:
        if message.sender_id != user.id and message.recipient_id != user.id:
            return Response({"error": "Not a conversation participant."}, status=status.HTTP_403_FORBIDDEN)

    reactions = (
        MessageReaction.objects
        .filter(message=message)
        .select_related('user')
        .order_by('emoji', 'created_at')
    )
    user_ids = [r.user_id for r in reactions]
    avatar_map = _build_avatar_map(user_ids)

    data = [
        {
            'emoji': r.emoji,
            'username': r.user.username,
            'display_name': r.user.display_name or r.user.username,
            'avatar_url': avatar_map.get(str(r.user_id)),
        }
        for r in reactions
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ReactionRateThrottle])
def react_to_message(request, message_id):
    """
    Toggle an emoji reaction on a message.
    Body: {"emoji": "👍"}
    Returns updated grouped reaction list for that message.
    """
    serializer = ReactMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        services.toggle_message_reaction(
            request.user, message_id, serializer.validated_data['emoji']
        )
        from messaging.models import Message
        message = Message.objects.get(id=message_id)
        reactions = services.get_message_reactions(message, request.user)
    except MessageNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response({"reactions": reactions})
