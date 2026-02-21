from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from gyms.models import Gym
from gyms import services
from gyms.serializers import (
    GymListSerializer,
    GymDetailSerializer,
    BusyLevelSubmitSerializer,
    BusyLevelResponseSerializer,
    WorkoutInviteCreateSerializer,
    WorkoutInviteListSerializer,
    WorkoutInviteDetailSerializer,
    JoinRequestCreateSerializer,
    JoinRequestSerializer,
    LeaderboardEntrySerializer,
)
from gyms.exceptions import (
    GymNotFoundError,
    AlreadyEnrolledError,
    BusyLevelCooldownError,
    NotEligibleError,
    WorkoutInviteNotFoundError,
    JoinRequestNotFoundError,
    InviteFullError,
    InviteExpiredError,
    DuplicateJoinRequestError,
    NotInviteOwnerError,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_list(request):
    """Search/browse gyms. Optional query param: ?q=<search term>"""
    query = request.query_params.get('q', '').strip()
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    gyms = services.search_gyms(query=query or None, limit=limit, offset=offset)
    serializer = GymListSerializer(gyms, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_detail(request, gym_id):
    """Get full details for a single gym."""
    gym = get_object_or_404(Gym, id=gym_id)
    serializer = GymDetailSerializer(gym, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gym_enroll(request, gym_id):
    """Enroll the current user at this gym."""
    try:
        gym = services.enroll_user(request.user, gym_id)
    except GymNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except AlreadyEnrolledError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    serializer = GymDetailSerializer(gym, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gym_unenroll(request, gym_id):
    """Unenroll the current user from a specific gym."""
    try:
        services.unenroll_user(request.user, gym_id)
    except GymNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_current(request):
    """Get all gyms the current user is enrolled at."""
    gyms = request.user.enrolled_gyms.all()
    serializer = GymDetailSerializer(gyms, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def gym_busy_level(request, gym_id):
    """GET: current busy level. POST: submit a busy level survey response."""
    if request.method == 'GET':
        data = services.get_current_busy_level(gym_id)
        serializer = BusyLevelResponseSerializer(data)
        return Response(serializer.data)

    # POST
    serializer = BusyLevelSubmitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        data = services.submit_busy_level(
            user=request.user,
            gym_id=gym_id,
            survey_response=serializer.validated_data['survey_response'],
        )
    except GymNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotEligibleError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except BusyLevelCooldownError as e:
        return Response({"error": str(e)}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    response = BusyLevelResponseSerializer(data)
    return Response(response.data, status=status.HTTP_201_CREATED)


# ---- Workout Invite views ----

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def invite_list_create(request):
    """GET: list invites visible to user. POST: create a new invite."""
    if request.method == 'GET':
        gym_id = request.query_params.get('gym_id')
        invites = services.list_workout_invites(request.user, gym_id=gym_id)
        serializer = WorkoutInviteListSerializer(invites, many=True)
        return Response(serializer.data)

    # POST
    serializer = WorkoutInviteCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        invite = services.create_workout_invite(request.user, serializer.validated_data)
    except GymNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except WorkoutInviteNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)

    if invite.invited_user_id:
        from notifications.dispatcher import notify_workout_invite
        notify_workout_invite(request.user, invite.invited_user, invite)

    return Response(
        WorkoutInviteDetailSerializer(invite, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def invite_detail_cancel(request, invite_id):
    """GET: invite details. DELETE: creator cancels invite."""
    if request.method == 'GET':
        try:
            invite = services.get_workout_invite_detail(invite_id)
        except WorkoutInviteNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkoutInviteDetailSerializer(invite, context={'request': request})
        return Response(serializer.data)

    # DELETE
    try:
        services.cancel_workout_invite(request.user, invite_id)
    except WorkoutInviteNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotInviteOwnerError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(status=status.HTTP_204_NO_CONTENT)


# ---- Join Request views ----

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invite_decline(request, invite_id):
    """Invited user declines a personal workout invite."""
    from gyms.models import WorkoutInvite
    try:
        invite = WorkoutInvite.objects.get(id=invite_id, invited_user=request.user)
    except WorkoutInvite.DoesNotExist:
        return Response({"error": "Invite not found."}, status=status.HTTP_404_NOT_FOUND)

    invite.invited_user = None
    invite.save(update_fields=['invited_user', 'updated_at'])

    from notifications.models import Notification
    Notification.objects.filter(
        recipient=request.user,
        type=Notification.Type.WORKOUT_INVITE,
        target_id=str(invite_id),
    ).delete()

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_create(request, invite_id):
    """Request to join a workout invite."""
    serializer = JoinRequestCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        join_request = services.create_join_request(
            request.user, invite_id, serializer.validated_data['description']
        )
    except WorkoutInviteNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except InviteExpiredError as e:
        return Response({"error": str(e)}, status=status.HTTP_410_GONE)
    except InviteFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except DuplicateJoinRequestError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)

    from notifications.dispatcher import notify_workout_join_request
    notify_workout_join_request(request.user, join_request.workout_invite, join_request)

    return Response(JoinRequestSerializer(join_request).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def join_request_list(request, invite_id):
    """Creator lists all join requests for their invite."""
    try:
        requests = services.list_join_requests(request.user, invite_id)
    except WorkoutInviteNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotInviteOwnerError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(JoinRequestSerializer(requests, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_accept(request, request_id):
    """Creator accepts a join request."""
    try:
        join_request = services.accept_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotInviteOwnerError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except InviteFullError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)

    return Response(JoinRequestSerializer(join_request).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_request_deny(request, request_id):
    """Creator denies a join request."""
    try:
        join_request = services.deny_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotInviteOwnerError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(JoinRequestSerializer(join_request).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def join_request_cancel(request, request_id):
    """Requester cancels their own pending join request."""
    try:
        services.cancel_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotInviteOwnerError as e:
        return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response(status=status.HTTP_204_NO_CONTENT)


# ---- Leaderboard views ----

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_leaderboard(request, gym_id):
    """Get the streak leaderboard for a gym. Recalculates on each fetch."""
    try:
        entries = services.get_gym_leaderboard(gym_id)
    except GymNotFoundError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    serializer = LeaderboardEntrySerializer(entries, many=True)
    return Response(serializer.data)
