import logging

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework import status

from accounts.models import User

logger = logging.getLogger(__name__)


class AuthRateThrottle(AnonRateThrottle):
    """Strict per-IP throttle for auth endpoints to limit brute-force attempts."""
    scope = 'auth'


def _user_brief(user):
    return {
        'id': str(user.id),
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url or None,
        'streak': user.current_streak,
    }


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_login_view(request):
    """Token-based login for mobile clients."""
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '').strip()

    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.is_active:
        return Response({'error': 'Account is deactivated.'}, status=status.HTTP_403_FORBIDDEN)

    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': _user_brief(user),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_signup_view(request):
    """Token-based signup for mobile clients."""
    data = request.data
    required = ['username', 'email', 'display_name', 'phone_number', 'birthday', 'password']
    for field in required:
        if not data.get(field):
            return Response({'error': f'{field} is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=data['username']).exists():
        return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email=data['email']).exists():
        return Response({'error': 'Email already in use.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(phone_number=data['phone_number']).exists():
        return Response({'error': 'Phone number already in use.'}, status=status.HTTP_400_BAD_REQUEST)

    password = data.get('password')
    password_confirm = data.get('password_confirm')
    if password_confirm and password != password_confirm:
        return Response({'error': 'Passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.create_user(
            username=data['username'],
            email=data['email'],
            display_name=data['display_name'],
            phone_number=data['phone_number'],
            birthday=data['birthday'],
            password=password,
        )
    except IntegrityError:
        # Race condition: duplicate created between our existence check and insert
        return Response({'error': 'Account already exists. Please try different credentials.'}, status=status.HTTP_400_BAD_REQUEST)
    except (DjangoValidationError, ValueError):
        return Response({'error': 'Invalid data provided.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        # Unexpected error — log internally, never expose details to the client
        logger.exception("Unexpected error during user creation")
        return Response({'error': 'Registration failed. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': _user_brief(user),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_me_view(request):
    """Return current authenticated user's profile."""
    return Response(_user_brief(request.user))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_profile_view(request, username):
    """Return another user's profile."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from social.models import Follow
    is_following = Follow.objects.filter(follower=request.user, following=target).exists()
    follower_count = Follow.objects.filter(following=target).count()
    following_count = Follow.objects.filter(follower=target).count()
    # Friends = mutual follows
    friend_count = Follow.objects.filter(
        follower=target,
        following__in=Follow.objects.filter(following=target).values('follower'),
    ).count()

    return Response({
        'id': str(target.id),
        'username': target.username,
        'display_name': target.display_name,
        'avatar_url': target.avatar_url or None,
        'bio': target.bio,
        'streak': target.current_streak,
        'longest_streak': target.longest_streak,
        'total_workouts': target.total_workouts,
        'is_following': is_following,
        'follower_count': follower_count,
        'following_count': following_count,
        'friend_count': friend_count,
        'member_since': target.member_since,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_user_posts_view(request, username):
    """Return all posts and check-ins for a given user."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from social.views import get_user_posts, _serialize_feed_items_for_json
    all_posts = get_user_posts(target, viewer=request.user)
    for post in all_posts:
        post['user'] = target

    # Cursor-based pagination (cursor = string offset)
    try:
        limit = max(1, min(int(request.GET.get('limit', 9)), 50))
        offset = max(0, int(request.GET.get('cursor', 0)))
    except (ValueError, TypeError):
        limit, offset = 9, 0

    page = all_posts[offset:offset + limit]
    serialized = _serialize_feed_items_for_json(page)
    next_cursor = str(offset + limit) if (offset + limit) < len(all_posts) else ''
    return Response({'items': serialized, 'next_cursor': next_cursor})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_save_pr_view(request):
    """Mobile API: create or update a personal record. Supports multipart (video upload)."""
    from workouts.models import PersonalRecord
    from django.utils import timezone

    exercise_name = request.data.get('exercise_name', '').strip()
    value = request.data.get('value', '')
    unit = request.data.get('unit', '').strip()
    video = request.FILES.get('video')
    pr_id = request.data.get('pr_id', '').strip()

    if not exercise_name or not value or not unit:
        return Response({'error': 'Exercise name, value, and unit are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        value = float(value)
    except (ValueError, TypeError):
        return Response({'error': 'Invalid value.'}, status=status.HTTP_400_BAD_REQUEST)

    if pr_id:
        try:
            pr = PersonalRecord.objects.get(pk=pr_id, user=request.user)
        except PersonalRecord.DoesNotExist:
            return Response({'error': 'PR not found.'}, status=status.HTTP_404_NOT_FOUND)
        pr.exercise_name = exercise_name
        pr.value = value
        pr.unit = unit
        pr.achieved_date = timezone.now().date()
        if video:
            pr.video = video
        pr.save()
    else:
        pr = PersonalRecord.objects.create(
            user=request.user,
            exercise_name=exercise_name,
            value=value,
            unit=unit,
            achieved_date=timezone.now().date(),
            video=video,
        )

    return Response({
        'id': str(pr.id),
        'exercise_name': pr.exercise_name,
        'value': pr.value,
        'unit': pr.unit,
        'video_url': pr.video.url if pr.video else None,
        'created_at': pr.achieved_date.isoformat() if pr.achieved_date else None,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_delete_pr_view(request):
    """Mobile API: delete a personal record."""
    from workouts.models import PersonalRecord

    pr_id = request.data.get('pr_id', '').strip()
    if not pr_id:
        return Response({'error': 'pr_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        pr = PersonalRecord.objects.get(pk=pr_id, user=request.user)
        pr.delete()
        return Response({'success': True})
    except PersonalRecord.DoesNotExist:
        return Response({'error': 'PR not found.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_user_prs_view(request, username):
    """Return personal records for a given user."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from workouts.models import PersonalRecord
    prs = PersonalRecord.objects.filter(user=target).order_by('-achieved_date')
    results = []
    for pr in prs:
        results.append({
            'id': str(pr.id),
            'exercise_name': pr.exercise_name,
            'value': pr.value,
            'unit': pr.unit,
            'video_url': pr.video.url if pr.video else None,
            'created_at': pr.achieved_date.isoformat() if pr.achieved_date else None,
        })
    return Response(results)
