from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Exists, OuterRef

from groups import services
from groups.models import Group, GroupMember
from groups.serializers import (
    GroupListSerializer,
    GroupDetailSerializer,
    GroupMemberSerializer,
    GroupInviteCodeSerializer,
    GroupJoinRequestSerializer,
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
)


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_list(request):
    """Search/browse public groups. Optional: ?q=<search>&limit=50&offset=0"""
    query = request.query_params.get('q', '').strip()
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    groups = services.search_groups(query=query or None, limit=limit, offset=offset)

    # Annotate member_count and is_member for the list serializer
    groups = groups.annotate(
        member_count=Count('members'),
        is_member=Exists(
            GroupMember.objects.filter(group=OuterRef('pk'), user=request.user)
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
def group_create(request):
    """Create a new group."""
    serializer = CreateGroupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    group = services.create_group(request.user, **serializer.validated_data)
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
