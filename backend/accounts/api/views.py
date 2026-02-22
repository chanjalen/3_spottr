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
        'member_since': target.member_since,
    })
