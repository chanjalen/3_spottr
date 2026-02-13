from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from messaging import services
from messaging.serializers import (
    MessageSerializer,
    ConversationSerializer,
    GroupConversationSerializer,
    UnreadCountSerializer,
    SendDMSerializer,
    SendGroupMessageSerializer,
    MarkReadSerializer,
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
)


# ---------------------------------------------------------------------------
# Send Messages
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
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

    return Response(
        MessageSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
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

    return Response(
        MessageSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
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
        )
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except PostNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    return Response(
        MessageSerializer(message, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dm_conversations(request):
    """
    List all DM conversations with the latest message per partner.
    Returns conversation previews with unread counts.
    """
    latest_messages = services.list_dm_conversations(request.user)

    conversations = []
    for msg in latest_messages:
        # Determine the conversation partner
        if msg.sender == request.user:
            partner = msg.recipient
        else:
            partner = msg.sender

        # Count unread from this partner
        from messaging.models import Message
        from django.db.models import Q
        unread = Message.objects.filter(
            sender=partner, recipient=request.user,
        ).exclude(
            read_receipts__user=request.user,
        ).count()

        conversations.append({
            'partner_id': str(partner.id),
            'partner_username': partner.username,
            'latest_message': msg,
            'unread_count': unread,
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
    Returns conversation previews with unread counts.
    """
    latest_messages = services.list_group_conversations(request.user)

    conversations = []
    for msg in latest_messages:
        from messaging.models import Message
        unread = Message.objects.filter(
            group=msg.group,
        ).exclude(
            sender=request.user,
        ).exclude(
            read_receipts__user=request.user,
        ).count()

        conversations.append({
            'group_id': str(msg.group.id),
            'group_name': msg.group.name,
            'latest_message': msg,
            'unread_count': unread,
        })

    serializer = GroupConversationSerializer(
        conversations, many=True, context={'request': request}
    )
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Message History
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dm_messages(request, partner_id):
    """Get message history with a specific user. Supports ?limit= and ?offset=."""
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    try:
        messages = services.get_dm_messages(request.user, partner_id, limit=limit, offset=offset)
    except CannotMessageSelfError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except RecipientNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except UserBlockedError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except NotMutualFollowError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    serializer = MessageSerializer(messages, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_messages(request, group_id):
    """Get message history for a group. Supports ?limit= and ?offset=."""
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    try:
        messages = services.get_group_messages(request.user, group_id, limit=limit, offset=offset)
    except ConversationNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    serializer = MessageSerializer(messages, many=True, context={'request': request})
    return Response(serializer.data)


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
