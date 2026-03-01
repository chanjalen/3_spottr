from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Avg, Count
from django.core.cache import cache
from datetime import timedelta
from collections import defaultdict

from gyms.models import Gym, BusyLevel
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
    TopLifterSerializer,
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


BUSY_LABELS = {1: 'Not crowded', 2: 'Not too crowded', 3: 'Moderately crowded', 4: 'Crowded', 5: 'Very crowded'}
LEADERBOARD_TTL = 15 * 60  # 15 minutes


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_list(request):
    """Search/browse gyms. Optional query param: ?q=<search term>"""
    query = request.query_params.get('q', '').strip()
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    gyms = services.search_gyms(query=query or None, limit=limit, offset=offset)
    gym_ids = [str(g.id) for g in gyms]

    # Batch busy level (1 aggregation query)
    one_hour_ago = timezone.now() - timedelta(hours=1)
    busy_map = {}
    for row in (BusyLevel.objects
                .filter(gym_id__in=gym_ids, timestamp__gte=one_hour_ago)
                .values('gym_id')
                .annotate(avg=Avg('survey_response'), count=Count('id'))):
        level = round(row['avg']) if row['avg'] else None
        busy_map[str(row['gym_id'])] = {
            'level': level,
            'label': BUSY_LABELS.get(level),
            'total_responses': row['count'],
        }

    # Batch top lifter (2 queries: enrollments + PRs)
    from accounts.models import User
    from workouts.models import PersonalRecord

    EnrolledGym = User.enrolled_gyms.through
    enrollments = EnrolledGym.objects.filter(gym_id__in=gym_ids).values('gym_id', 'user_id')
    gym_users = defaultdict(set)
    for e in enrollments:
        gym_users[str(e['gym_id'])].add(e['user_id'])

    all_user_ids = {uid for uids in gym_users.values() for uid in uids}
    user_totals = {}
    if all_user_ids:
        for pr in (PersonalRecord.objects
                   .filter(user_id__in=all_user_ids,
                           exercise_name__in=['Bench Press', 'Squat', 'Deadlift'],
                           video__isnull=False)
                   .exclude(video='')
                   .values('user_id', 'exercise_name', 'value', 'unit',
                           'user__username', 'user__display_name')):
            try:
                val = float(pr['value'])
            except (ValueError, TypeError):
                continue
            if pr['unit'] == 'kg':
                val *= 2.205
            uid = pr['user_id']
            if uid not in user_totals:
                user_totals[uid] = {
                    'username': pr['user__username'],
                    'display_name': pr['user__display_name'] or pr['user__username'],
                    'bench': 0, 'squat': 0, 'deadlift': 0,
                }
            ex = pr['exercise_name'].lower()
            if 'bench' in ex:
                user_totals[uid]['bench'] = max(user_totals[uid]['bench'], val)
            elif 'squat' in ex:
                user_totals[uid]['squat'] = max(user_totals[uid]['squat'], val)
            elif 'deadlift' in ex:
                user_totals[uid]['deadlift'] = max(user_totals[uid]['deadlift'], val)

        # Batch-fetch avatar URLs for all users who have PRs (1 query)
        from media.models import MediaLink
        from django.conf import settings
        avatar_rows = (
            MediaLink.objects
            .filter(destination_type='user', destination_id__in=[str(uid) for uid in user_totals], type='avatar')
            .select_related('asset')
        )
        avatar_map = {row.destination_id: row.asset.url for row in avatar_rows}
        for uid in user_totals:
            user_totals[uid]['avatar_url'] = avatar_map.get(str(uid), '')

    top_lifter_map = {}
    for gid, user_ids in gym_users.items():
        candidates = [(uid, user_totals[uid]) for uid in user_ids if uid in user_totals]
        if candidates:
            top_uid, d = max(candidates, key=lambda x: x[1]['bench'] + x[1]['squat'] + x[1]['deadlift'])
            total = d['bench'] + d['squat'] + d['deadlift']
            if total > 0:
                top_lifter_map[gid] = {
                    'rank': 1,
                    'username': d['username'],
                    'display_name': d['display_name'],
                    'avatar_url': d['avatar_url'],
                    'value': round(total, 1),
                    'unit': 'lbs',
                }

    # Batch enrolled gym IDs (1 query, replaces N queries in serializer)
    enrolled_ids = set(str(i) for i in request.user.enrolled_gyms.values_list('id', flat=True))

    serializer = GymListSerializer(gyms, many=True, context={
        'request': request,
        'enrolled_ids': enrolled_ids,
        'busy_map': busy_map,
        'top_lifter_map': top_lifter_map,
    })
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
def gym_busy_level_hourly(request, gym_id):
    """GET: 24-hour busy level breakdown for a given date (defaults to today UTC).

    Query params:
      ?date=YYYY-MM-DD  — specific date (defaults to today)

    Returns a list of 24 objects, one per hour (0–23):
      { hour, avg_level, rounded_level, label, total_responses, breakdown{1-5} }
    """
    from datetime import date as date_cls

    date_str = request.query_params.get('date')
    if date_str:
        try:
            target_date = date_cls.fromisoformat(date_str)
        except ValueError:
            return Response({"error": "Invalid date. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        target_date = timezone.now().date()

    if not Gym.objects.filter(id=gym_id).exists():
        return Response({"error": "Gym not found."}, status=status.HTTP_404_NOT_FOUND)

    qs = BusyLevel.objects.filter(gym_id=gym_id, timestamp__date=target_date)

    LABELS = {
        1: 'Not crowded',
        2: 'Not too crowded',
        3: 'Moderately crowded',
        4: 'Crowded',
        5: 'Very crowded',
    }

    hours_data = []
    for h in range(24):
        responses = list(qs.filter(timestamp__hour=h).values_list('survey_response', flat=True))
        total = len(responses)
        breakdown = {'1': 0, '2': 0, '3': 0, '4': 0, '5': 0}
        for r in responses:
            key = str(r)
            if key in breakdown:
                breakdown[key] += 1

        if total > 0:
            avg = sum(responses) / total
            rounded = round(avg)
            label = LABELS.get(rounded)
        else:
            avg = None
            rounded = None
            label = None

        hours_data.append({
            'hour': h,
            'avg_level': round(avg, 2) if avg is not None else None,
            'rounded_level': rounded,
            'label': label,
            'total_responses': total,
            'breakdown': breakdown,
        })

    return Response(hours_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gym_leaderboard(request, gym_id):
    """Get top lifters for a gym by PR. Optional ?lift=total|bench|squat|deadlift"""
    if not Gym.objects.filter(id=gym_id).exists():
        return Response({"error": "Gym not found."}, status=status.HTTP_404_NOT_FOUND)
    lift = request.query_params.get('lift', 'total')
    cache_key = f'gym:leaderboard:{gym_id}:{lift}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    entries = services.get_top_lifters(gym_id, lift=lift)
    data = TopLifterSerializer(entries, many=True).data
    cache.set(cache_key, data, LEADERBOARD_TTL)
    return Response(data)
