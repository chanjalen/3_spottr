from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from common.throttles import CreateRateThrottle
from django.db.models import Count, Exists, OuterRef

from groups import services
from groups.models import Group, GroupMember, GroupJoinRequest
from groups.serializers import (
    GroupListSerializer,
    GroupDetailSerializer,
    GroupMemberSerializer,
    GroupInviteCodeSerializer,
    GroupJoinRequestSerializer,
    GroupStreakDetailSerializer,
    CreateGroupSerializer,
    UpdateGroupSerializer,
    JoinRequestMessageSerializer,
    JoinViaCodeSerializer,
)
from groups.exceptions import (
    GroupNotFoundError,
    NotGroupMemberError,
    NotGroupAdminError,
    AlreadyGroupMemberError,
    JoinRequestNotFoundError,
    DuplicateJoinRequestError,
    InvalidInviteCodeError,
    CannotRemoveCreatorError,
    InviteCodeNotFoundError,
    GroupFullError,
)


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_list(request):
    """
    Search/browse groups. Optional: ?q=<search>&limit=50&offset=0
    When ?q= is provided, results include both public and private groups.
    Without a query, only public groups are returned.
    """
    query = request.query_params.get('q', '').strip()[:100]
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    include_private = bool(query)
    groups = services.search_groups(
        query=query or None,
        limit=limit,
        offset=offset,
        include_private=include_private,
    )

    groups = groups.annotate(
        member_count=Count('members'),
        is_member=Exists(
            GroupMember.objects.filter(group=OuterRef('pk'), user=request.user)
        ),
        has_pending_request=Exists(
            GroupJoinRequest.objects.filter(
                group=OuterRef('pk'),
                user=request.user,
                status=GroupJoinRequest.Status.PENDING,
            )
        ),
    )

    serializer = GroupListSerializer(groups, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_groups(request):
    """List groups the authenticated user belongs to."""
    groups = services.list_user_groups(request.user).annotate(
        member_count=Count('members'),
        is_member=Exists(
            GroupMember.objects.filter(group=OuterRef('pk'), user=request.user)
        ),
    )
    serializer = GroupListSerializer(groups, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([CreateRateThrottle])
def group_create(request):
    """Create a new group."""
    serializer = CreateGroupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data.copy()
    member_ids = data.pop('member_ids', [])

    group = services.create_group(request.user, **data)

    # Auto-add requested members (silently skip errors for invalid/already-member users)
    for user_id in member_ids:
        try:
            services.add_member(request.user, group.id, user_id)
        except Exception:
            pass

    # Create an InboxEntry for the creator so the new group immediately appears
    # in their messaging inbox (even before any messages are sent).
    try:
        from messaging.models import InboxEntry
        from django.utils import timezone as tz
        InboxEntry.objects.get_or_create(
            user=request.user,
            conversation_type='group',
            group=group,
            defaults={'unread_count': 0, 'latest_message_at': tz.now()},
        )
    except Exception:
        pass

    return Response(
        GroupDetailSerializer(group, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_detail(request, group_id):
    """Get group details."""
    try:
        group = services.get_group(group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    # For private groups, only members can see full details
    if group.privacy == Group.Privacy.PRIVATE:
        if not GroupMember.objects.filter(group=group, user=request.user).exists():
            return Response(
                {"error": "This group is private."},
                status=status.HTTP_403_FORBIDDEN,
            )

    serializer = GroupDetailSerializer(group, context={'request': request})
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def group_update(request, group_id):
    """Update group details. Admin/creator only."""
    serializer = UpdateGroupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        group = services.update_group(request.user, group_id, **serializer.validated_data)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(GroupDetailSerializer(group, context={'request': request}).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def group_avatar_update(request, group_id):
    """Upload or replace the group avatar. Admin/creator only."""
    if 'avatar' not in request.FILES:
        return Response({"error": "No avatar file provided."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        group = services.update_group_avatar(request.user, group_id, request.FILES['avatar'])
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(GroupDetailSerializer(group, context={'request': request}).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def group_delete(request, group_id):
    """Delete a group. Creator only."""
    try:
        services.delete_group(request.user, group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def member_list(request, group_id):
    """List group members. Public groups: anyone. Private groups: members only."""
    try:
        members = services.list_members(group_id, requesting_user=request.user)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    serializer = GroupMemberSerializer(members, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def group_join(request, group_id):
    """Join a public group directly."""
    try:
        membership = services.join_public_group(request.user, group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupAdminError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except AlreadyGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except GroupFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from messaging.services import send_system_group_message
        send_system_group_message(
            group_id=membership.group.id,
            content=f"{request.user.display_name or request.user.username} has joined the group",
            sender=request.user,
        )
    except Exception:
        pass

    return Response(
        GroupMemberSerializer(membership).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def group_leave(request, group_id):
    """Leave a group. Creator cannot leave."""
    try:
        services.leave_group(request.user, group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from messaging.services import send_system_group_message
        send_system_group_message(
            group_id=group_id,
            content=f"{request.user.display_name or request.user.username} has left the group",
            sender=request.user,
        )
    except Exception:
        pass

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def member_add(request, group_id, user_id):
    """Admin adds a user to the group."""
    try:
        membership = services.add_member(request.user, group_id, user_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except AlreadyGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except GroupFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        GroupMemberSerializer(membership).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def member_remove(request, group_id, user_id):
    """Admin removes a member from the group. Cannot remove the creator."""
    try:
        services.remove_member(request.user, group_id, user_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def member_promote(request, group_id, user_id):
    """Promote a member to admin."""
    try:
        membership = services.promote_member(request.user, group_id, user_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(GroupMemberSerializer(membership).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def member_demote(request, group_id, user_id):
    """Demote an admin back to member."""
    try:
        membership = services.demote_member(request.user, group_id, user_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(GroupMemberSerializer(membership).data)


# ---------------------------------------------------------------------------
# Invite Codes
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def invite_code_list_create(request, group_id):
    """
    GET  - List all invite codes for a group (admin only).
    POST - Generate a new invite code (admin only).
    """
    if request.method == 'GET':
        try:
            codes = services.list_invite_codes(request.user, group_id)
        except GroupNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except (NotGroupMemberError, NotGroupAdminError) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        serializer = GroupInviteCodeSerializer(codes, many=True)
        return Response(serializer.data)

    # POST
    try:
        code = services.generate_invite_code(request.user, group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(
        GroupInviteCodeSerializer(code).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def invite_code_deactivate(request, group_id, code_id):
    """Deactivate an invite code. Admin only."""
    try:
        services.deactivate_invite_code(request.user, group_id, code_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except InviteCodeNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_via_code(request):
    """Join a group using an invite code."""
    serializer = JoinViaCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        membership = services.join_via_code(request.user, serializer.validated_data['code'])
    except InvalidInviteCodeError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except AlreadyGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except GroupFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from messaging.services import send_system_group_message
        send_system_group_message(
            group_id=membership.group.id,
            content=f"{request.user.display_name or request.user.username} has joined the group",
            sender=request.user,
        )
    except Exception:
        pass

    return Response(
        GroupMemberSerializer(membership).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# Join Requests (private groups)
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_create(request, group_id):
    """Request to join a private group."""
    serializer = JoinRequestMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        join_request = services.create_join_request(
            request.user, group_id, message=serializer.validated_data.get('message', '')
        )
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except AlreadyGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except DuplicateJoinRequestError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)

    from notifications.dispatcher import notify_group_join_request
    notify_group_join_request(request.user, join_request.group, join_request)

    # Post a system message in the group chat so admins see the request inline
    try:
        from messaging.services import send_system_group_message
        display = request.user.display_name or request.user.username
        send_system_group_message(
            group_id=join_request.group.id,
            content=f"🔒 {display} requested to join '{join_request.group.name}'",
            join_request=join_request,
            sender=request.user,
        )
    except Exception:
        pass  # Never block the request if messaging fails

    return Response(
        GroupJoinRequestSerializer(join_request).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def join_request_list(request, group_id):
    """List pending join requests for a group. Admin only."""
    try:
        requests_qs = services.list_join_requests(request.user, group_id)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    serializer = GroupJoinRequestSerializer(requests_qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_accept(request, group_id, request_id):
    """Accept a join request. Admin only."""
    try:
        join_request = services.accept_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except GroupFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(GroupJoinRequestSerializer(join_request).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_deny(request, group_id, request_id):
    """Deny a join request. Admin only."""
    try:
        join_request = services.deny_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotGroupMemberError, NotGroupAdminError) as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(GroupJoinRequestSerializer(join_request).data)


# ---------------------------------------------------------------------------
# Group Streak
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_streak_detail(request, group_id):
    """Get group streak details including per-member streak info."""
    try:
        data = services.get_group_streak_details(group_id, request.user)
    except GroupNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotGroupMemberError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    serializer = GroupStreakDetailSerializer(data)
    return Response(serializer.data)
