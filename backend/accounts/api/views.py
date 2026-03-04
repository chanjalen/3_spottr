import hashlib
import logging
import re
import secrets
from datetime import date, timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.models import User
from common.throttles import AuthRateThrottle, ResendVerificationThrottle, SearchRateThrottle  # noqa: re-exported

logger = logging.getLogger(__name__)

RESERVED_USERNAMES = frozenset({
    'admin', 'spottr', 'support', 'help', 'api', 'www', 'mail', 'root',
    'test', 'user', 'staff', 'mod', 'moderator', 'official', 'system',
    'contact', 'info', 'noreply', 'security', 'abuse', 'postmaster',
})

USERNAME_RE = re.compile(r'^[a-z0-9_.]{3,30}$')


def _user_brief(user):
    return {
        'id': str(user.id),
        'username': user.username,
        'display_name': user.display_name,
        'avatar_url': user.avatar_url or None,
        'streak': user.current_streak,
        'email': user.email,
        'phone_number': user.phone_number,
        'birthday': user.birthday.isoformat() if user.birthday else None,
        'workout_frequency': user.workout_frequency,
        'is_email_verified': user.is_email_verified,
        'onboarding_step': user.onboarding_step,
    }


def _send_email(subject: str, to: str, text_body: str, html_body: str) -> None:
    """Send a transactional email with plain-text and HTML alternatives."""
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        to=[to],
    )
    msg.attach_alternative(html_body, 'text/html')
    try:
        msg.send()
    except Exception:
        logger.exception('Failed to send email to %s (subject: %s)', to, subject)


def _send_password_reset_email(user, code: str) -> None:
    text = (
        f'Your Spottr password reset code is: {code}\n\n'
        'This code expires in 15 minutes.\n\n'
        'If you did not request a password reset, you can ignore this email.'
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#111;color:#f0f0f0;border-radius:12px;">
      <h1 style="font-size:28px;font-weight:700;color:#4FC3E0;margin:0 0 4px;">Spottr</h1>
      <p style="color:#888;font-size:13px;margin:0 0 32px;">Track. Share. Compete.</p>
      <h2 style="font-size:20px;font-weight:600;margin:0 0 8px;">Reset your password</h2>
      <p style="color:#aaa;font-size:15px;margin:0 0 24px;">Enter this code in the app to set a new password. It expires in 15 minutes.</p>
      <div style="background:#1e1e1e;border:1px solid #333;border-radius:10px;padding:24px;text-align:center;letter-spacing:12px;font-size:36px;font-weight:700;color:#4FC3E0;">{code}</div>
      <p style="color:#555;font-size:12px;margin:32px 0 0;text-align:center;">If you didn't request this, your password has not been changed.</p>
    </div>
    """
    _send_email('Reset your Spottr password', user.email, text, html)


def _send_verification_email(user, code: str) -> None:
    text = (
        f'Your Spottr verification code is: {code}\n\n'
        'This code expires in 15 minutes.\n\n'
        'If you did not create a Spottr account, you can ignore this email.'
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#111;color:#f0f0f0;border-radius:12px;">
      <h1 style="font-size:28px;font-weight:700;color:#4FC3E0;margin:0 0 4px;">Spottr</h1>
      <p style="color:#888;font-size:13px;margin:0 0 32px;">Track. Share. Compete.</p>
      <h2 style="font-size:20px;font-weight:600;margin:0 0 8px;">Verify your email</h2>
      <p style="color:#aaa;font-size:15px;margin:0 0 24px;">Enter this code in the app to confirm your address. It expires in 15 minutes.</p>
      <div style="background:#1e1e1e;border:1px solid #333;border-radius:10px;padding:24px;text-align:center;letter-spacing:12px;font-size:36px;font-weight:700;color:#4FC3E0;">{code}</div>
      <p style="color:#555;font-size:12px;margin:32px 0 0;text-align:center;">If you didn't create a Spottr account, you can safely ignore this email.</p>
    </div>
    """
    _send_email('Verify your Spottr account', user.email, text, html)


def _issue_verification_code(user):
    """Generate a 6-digit code, store its hash, and return the plaintext code."""
    code = str(secrets.randbelow(900000) + 100000)
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    user.email_verification_token = code_hash
    user.email_verification_token_expires = timezone.now() + timedelta(minutes=15)
    user.save(update_fields=['email_verification_token', 'email_verification_token_expires'])
    return code


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_login_view(request):
    """Token-based login for mobile clients. Accepts email or username."""
    identifier = request.data.get('username', '').strip()
    password = request.data.get('password', '').strip()

    if not identifier or not password:
        return Response({'error': 'Email/username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Resolve email → username so Django's authenticate() can work normally
    if '@' in identifier:
        try:
            lookup = User.objects.get(email=identifier.lower())
            username = lookup.username
        except User.DoesNotExist:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        username = identifier

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
    """
    Minimal signup: only email, password, birthday.
    Returns a provisional token; the client must complete email verification
    before calling signIn() to store it in SecureStore.
    """
    data = request.data
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    birthday_str = data.get('birthday', '').strip()

    if not email or not password or not birthday_str:
        return Response(
            {'error': 'Email, password, and birthday are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate email format
    try:
        validate_email(email)
    except DjangoValidationError:
        return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate birthday format and minimum age (13+)
    try:
        bday = date.fromisoformat(birthday_str)
        today = date.today()
        age = (today - bday).days // 365
        if age < 13:
            return Response(
                {'error': 'You must be at least 13 years old to sign up.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if bday > today:
            return Response({'error': 'Birthday cannot be in the future.'}, status=status.HTTP_400_BAD_REQUEST)
    except ValueError:
        return Response(
            {'error': 'Invalid birthday format. Use YYYY-MM-DD.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate password strength via Django validators
    try:
        validate_password(password)
    except DjangoValidationError as e:
        return Response({'error': e.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

    # If the email already exists but was never verified, let them retry verification
    # instead of leaving them permanently locked out.
    existing = User.objects.filter(email=email).first()
    if existing:
        if not existing.is_email_verified:
            code = _issue_verification_code(existing)
            _send_verification_email(existing, code)
            from rest_framework.authtoken.models import Token
            token, _ = Token.objects.get_or_create(user=existing)
            return Response({'token': token.key, 'user': _user_brief(existing)}, status=status.HTTP_200_OK)
        return Response(
            {'error': 'An account with this email already exists.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.create_user(
            email=email,
            birthday=birthday_str,
            password=password,
            is_email_verified=False,
            onboarding_step=0,
        )
    except IntegrityError:
        return Response(
            {'error': 'An account with this email already exists.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception:
        logger.exception('Unexpected error during user creation')
        return Response(
            {'error': 'Registration failed. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Issue verification code and send email
    code = _issue_verification_code(user)
    _send_verification_email(user, code)

    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)

    return Response({'token': token.key, 'user': _user_brief(user)}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_verify_email_view(request):
    """Verify the 6-digit code sent to the user's email address."""
    user = request.user
    code = str(request.data.get('code', '')).strip()

    if not code:
        return Response({'error': 'Verification code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if user.is_email_verified:
        return Response({'user': _user_brief(user)})

    now = timezone.now()
    if not user.email_verification_token or not user.email_verification_token_expires:
        return Response({'error': 'No verification code found. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    if now > user.email_verification_token_expires:
        return Response({'error': 'Verification code has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    submitted_hash = hashlib.sha256(code.encode()).hexdigest()
    if submitted_hash != user.email_verification_token:
        return Response({'error': 'Invalid verification code.'}, status=status.HTTP_400_BAD_REQUEST)

    user.is_email_verified = True
    user.onboarding_step = max(user.onboarding_step, 1)
    user.email_verification_token = None
    user.email_verification_token_expires = None
    user.save(update_fields=[
        'is_email_verified', 'onboarding_step',
        'email_verification_token', 'email_verification_token_expires',
    ])

    return Response({'user': _user_brief(user)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ResendVerificationThrottle])
def api_resend_verification_view(request):
    """Re-send the email verification code (max 3/hour)."""
    user = request.user

    if user.is_email_verified:
        return Response({'error': 'Email is already verified.'}, status=status.HTTP_400_BAD_REQUEST)

    code = _issue_verification_code(user)
    _send_verification_email(user, code)

    return Response({'detail': 'Verification code sent.'})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def api_onboarding_view(request):
    """
    Progress through onboarding steps.
    Each step submits one piece of profile data; the step counter advances
    using max(current, new) to prevent regression.
    """
    user = request.user
    data = request.data

    if not user.is_email_verified:
        return Response(
            {'error': 'Email must be verified before completing onboarding.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if 'display_name' in data:
        display_name = str(data['display_name']).strip()
        if not display_name:
            return Response({'error': 'Display name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(display_name) > 50:
            return Response({'error': 'Display name must be 50 characters or fewer.'}, status=status.HTTP_400_BAD_REQUEST)
        user.display_name = display_name
        user.onboarding_step = max(user.onboarding_step, 2)
        user.save(update_fields=['display_name', 'onboarding_step'])

    elif 'username' in data:
        raw_username = str(data['username']).strip().lower()
        if not USERNAME_RE.match(raw_username):
            return Response(
                {'error': 'Username must be 3–30 characters and can only contain lowercase letters, numbers, underscores, and dots.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if raw_username in RESERVED_USERNAMES:
            return Response({'error': 'This username is not available.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=raw_username).exclude(pk=user.pk).exists():
            return Response({'error': 'Username is already taken.'}, status=status.HTTP_400_BAD_REQUEST)
        user.username = raw_username
        user.onboarding_step = max(user.onboarding_step, 3)
        user.save(update_fields=['username', 'onboarding_step'])

    elif data.get('skip_phone'):
        user.onboarding_step = max(user.onboarding_step, 4)
        user.save(update_fields=['onboarding_step'])

    elif 'phone_number' in data:
        phone = str(data['phone_number']).strip()
        if phone and User.objects.filter(phone_number=phone).exclude(pk=user.pk).exists():
            return Response({'error': 'Phone number is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        user.phone_number = phone or None
        user.onboarding_step = max(user.onboarding_step, 4)
        user.save(update_fields=['phone_number', 'onboarding_step'])

    elif 'workout_frequency' in data:
        try:
            freq = int(data['workout_frequency'])
            if not (0 <= freq <= 7):
                raise ValueError()
        except (ValueError, TypeError):
            return Response({'error': 'Workout frequency must be a number between 0 and 7.'}, status=status.HTTP_400_BAD_REQUEST)
        user.workout_frequency = freq
        # Keep weekly_workout_goal in sync so the streak page reflects the chosen goal.
        # Clamp to 1 minimum since a goal of 0 doesn't make sense for streak tracking.
        user.weekly_workout_goal = max(1, freq)
        user.onboarding_step = max(user.onboarding_step, 5)
        user.save(update_fields=['workout_frequency', 'weekly_workout_goal', 'onboarding_step'])

    else:
        return Response({'error': 'No recognized onboarding field provided.'}, status=status.HTTP_400_BAD_REQUEST)

    return Response({'user': _user_brief(user)})


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([SearchRateThrottle])
def api_username_available_view(request):
    """Check whether a username is available. GET ?username=xxx"""
    raw = request.GET.get('username', '').strip().lower()

    if not raw:
        return Response({'error': 'username parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not USERNAME_RE.match(raw):
        return Response({'available': False, 'username': raw, 'error': 'Invalid format.'})

    if raw in RESERVED_USERNAMES:
        return Response({'available': False, 'username': raw})

    taken = User.objects.filter(username=raw).exists()
    return Response({'available': not taken, 'username': raw})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_me_view(request):
    """Return current authenticated user's profile."""
    return Response(_user_brief(request.user))


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_delete_account_view(request):
    """
    Permanently delete the authenticated user and all their data.
    Cascades to posts, check-ins, workouts, PRs, comments, follows, etc.
    """
    user = request.user
    # Revoke the auth token first so any in-flight requests fail cleanly
    try:
        from rest_framework.authtoken.models import Token
        Token.objects.filter(user=user).delete()
    except Exception:
        pass
    user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def api_update_avatar_view(request):
    """Update the authenticated user's avatar."""
    avatar = request.FILES.get('avatar')
    if not avatar:
        return Response({'error': 'No avatar provided.'}, status=status.HTTP_400_BAD_REQUEST)
    user = request.user
    user.avatar = avatar
    user.save(update_fields=['avatar'])

    # Keep MediaLink in sync so _build_avatar_map can find the avatar.
    from media.utils import create_media_asset
    from media.models import MediaLink
    old_links = MediaLink.objects.filter(
        destination_type='user',
        destination_id=str(user.pk),
        type='avatar',
    ).select_related('asset')
    for ml in old_links:
        ml.asset.delete()
    asset = create_media_asset(user, avatar, user.avatar.name, 'image', already_saved=True)
    MediaLink.objects.create(
        asset=asset,
        destination_type='user',
        destination_id=str(user.pk),
        type='avatar',
    )

    return Response(_user_brief(user))


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def api_update_profile_view(request):
    """Update display_name, bio, and/or timezone for the authenticated user."""
    user = request.user
    changed = []
    if 'display_name' in request.data:
        val = str(request.data['display_name']).strip()
        if len(val) > 50:
            return Response({'error': 'Display name cannot exceed 50 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        user.display_name = val
        changed.append('display_name')
    if 'bio' in request.data:
        val = str(request.data['bio']).strip()
        if len(val) > 300:
            return Response({'error': 'Bio cannot exceed 300 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        user.bio = val
        changed.append('bio')
    if 'timezone' in request.data:
        import zoneinfo
        tz_str = str(request.data['timezone']).strip()
        try:
            zoneinfo.ZoneInfo(tz_str)  # validate it's a real IANA timezone
            user.timezone = tz_str
            changed.append('timezone')
        except (zoneinfo.ZoneInfoNotFoundError, KeyError):
            pass  # ignore invalid timezone strings silently
    if changed:
        user.save(update_fields=changed)
    return Response(_user_brief(user))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_profile_view(request, username):
    """Return another user's profile."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from social.models import Follow, QuickWorkout
    from django.utils import timezone as tz
    is_following = Follow.objects.filter(follower=request.user, following=target).exists()
    is_followed_by = Follow.objects.filter(follower=target, following=request.user).exists()
    follower_count = Follow.objects.filter(following=target).count()
    following_count = Follow.objects.filter(follower=target).count()
    # Friends = mutual follows
    friend_count = Follow.objects.filter(
        follower=target,
        following__in=Follow.objects.filter(following=target).values('follower'),
    ).count()
    today = tz.now().date()
    has_checkin_today = QuickWorkout.objects.filter(user=target, created_at__date=today).exists()

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
        'is_followed_by': is_followed_by,
        'follower_count': follower_count,
        'following_count': following_count,
        'friend_count': friend_count,
        'member_since': target.member_since,
        'has_checkin_today': has_checkin_today,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mutual_followers_view(request, username):
    """
    Return users that the requester follows who also follow <username>.
    Optional ?q= for search.
    """
    from django.db import models as db_models
    from social.models import Follow
    from django.shortcuts import get_object_or_404

    target = get_object_or_404(User, username=username)
    if target == request.user:
        return Response([])

    # IDs of people I follow
    my_following_ids = set(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )
    # IDs of people who follow target
    target_follower_ids = set(
        Follow.objects.filter(following=target).values_list('follower_id', flat=True)
    )

    mutual_ids = my_following_ids & target_follower_ids

    q = request.query_params.get('q', '').strip()[:50]
    qs = User.objects.filter(id__in=mutual_ids)
    if q:
        qs = qs.filter(
            db_models.Q(username__icontains=q) | db_models.Q(display_name__icontains=q)
        )
    qs = qs.order_by('display_name')[:50]

    return Response([
        {
            'id': str(u.id),
            'username': u.username,
            'display_name': u.display_name,
            'avatar_url': u.avatar_url or None,
        }
        for u in qs
    ])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_user_post_thumbnails_view(request, username):
    """
    Fast thumbnail endpoint for the profile grid.
    Skips per-post like/comment queries — fetches photo URLs in two bulk queries.
    Total: ~5 DB queries regardless of post count (vs N*3 in the full endpoint).
    """
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        limit = max(1, min(int(request.GET.get('limit', 9)), 50))
        offset = max(0, int(request.GET.get('cursor', 0)))
    except (ValueError, TypeError):
        limit, offset = 9, 0

    from social.models import Post
    from social.views import _bulk_media_urls, build_media_url
    from workouts.models import PersonalRecord

    posts = list(
        Post.objects.filter(user=target)
        .select_related('workout')
        .order_by('-created_at')
        .only('id', 'created_at', 'description', 'photo', 'workout')
    )

    post_ids = [p.id for p in posts]
    post_photos = _bulk_media_urls('post', post_ids)

    pr_map = {}
    for pr in PersonalRecord.objects.filter(post_id__in=post_ids).values(
        'post_id', 'exercise_name', 'value', 'unit'
    ):
        pr_map[pr['post_id']] = pr

    items = []
    for p in posts:
        photo_url = post_photos.get(str(p.id)) or (build_media_url(p.photo.name) if p.photo else None)
        pr = pr_map.get(p.id)
        items.append({
            'id': p.id,
            'type': 'post',
            'created_at': p.created_at.isoformat(),
            'description': p.description,
            'photo_url': photo_url,
            'workout': {
                'id': str(p.workout.id),
                'exercise_count': 0,
                'total_sets': 0,
                'duration_minutes': 0,
                'exercises': [],
            } if p.workout else None,
            'personal_record': {
                'exercise_name': pr['exercise_name'],
                'value': pr['value'],
                'unit': pr['unit'],
            } if pr else None,
        })

    total = len(items)
    page = items[offset:offset + limit]
    next_cursor = str(offset + limit) if (offset + limit) < total else ''
    return Response({'items': page, 'next_cursor': next_cursor})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_user_posts_view(request, username):
    """Return all posts and check-ins for a given user."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from social.views import get_user_posts, _serialize_feed_items_for_json
    thumbnail = request.GET.get('fields') == 'thumbnail'
    all_posts = get_user_posts(target, viewer=request.user, thumbnail=thumbnail)
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

    exercise_name = request.data.get('exercise_name', '').strip()
    value = request.data.get('value', '')
    unit = request.data.get('unit', '').strip().lower()
    video = request.FILES.get('video')
    pr_id = request.data.get('pr_id', '').strip()

    if not exercise_name or not value or not unit:
        return Response({'error': 'Exercise name, value, and unit are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(exercise_name) > 100:
        return Response({'error': 'Exercise name cannot exceed 100 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    if unit not in ('lbs', 'kg', 'reps', 'sec', 'min'):
        return Response({'error': "Unit must be one of: lbs, kg, reps, sec, min."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        value = float(value)
    except (ValueError, TypeError):
        return Response({'error': 'Invalid value.'}, status=status.HTTP_400_BAD_REQUEST)

    max_value = 2000 if unit in ('lbs', 'kg') else 100000
    if value <= 0 or value > max_value:
        return Response({'error': f'Value must be between 0 and {max_value}.'}, status=status.HTTP_400_BAD_REQUEST)

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_user_checkins_view(request, username):
    """Return check-ins (QuickWorkout) for a given user, newest first."""
    try:
        target = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    from social.models import QuickWorkout
    from social.views import get_checkin_photo

    try:
        limit = max(1, min(int(request.GET.get('limit', 20)), 100))
        offset = max(0, int(request.GET.get('cursor', 0)))
    except (ValueError, TypeError):
        limit, offset = 20, 0

    qs = QuickWorkout.objects.filter(user=target).select_related('location').order_by('-created_at')

    try:
        cal_year = int(request.GET.get('year', 0))
        cal_month = int(request.GET.get('month', 0))
        if cal_year and cal_month:
            qs = qs.filter(created_at__year=cal_year, created_at__month=cal_month)
    except (ValueError, TypeError):
        pass

    total = qs.count()
    page = list(qs[offset:offset + limit])

    # Batch-fetch social counts to avoid N+1 queries
    from social.models import Reaction, Comment as SocialComment
    from django.db.models import Count
    page_ids = [qw.id for qw in page]
    reaction_counts = {
        r['quick_workout_id']: r['cnt']
        for r in Reaction.objects.filter(quick_workout_id__in=page_ids)
            .values('quick_workout_id').annotate(cnt=Count('id'))
    }
    comment_counts = {
        c['quick_workout_id']: c['cnt']
        for c in SocialComment.objects.filter(quick_workout_id__in=page_ids, parent_comment=None)
            .values('quick_workout_id').annotate(cnt=Count('id'))
    }
    user_liked_ids = set()
    if request.user.is_authenticated:
        user_liked_ids = set(
            Reaction.objects.filter(quick_workout_id__in=page_ids, user=request.user)
                .values_list('quick_workout_id', flat=True)
        )

    results = []
    for qw in page:
        results.append({
            'id': str(qw.id),
            'type': 'checkin',
            'description': qw.description,
            'location_name': qw.location_name or (qw.location.name if qw.location else ''),
            'workout_type': qw.type.replace('_', ' ').title() if qw.type else '',
            'photo_url': get_checkin_photo(qw.id),
            'created_at': qw.created_at.isoformat(),
            'like_count': reaction_counts.get(qw.id, 0),
            'user_liked': qw.id in user_liked_ids,
            'comment_count': comment_counts.get(qw.id, 0),
        })

    next_cursor = str(offset + limit) if (offset + limit) < total else ''
    return Response({'items': results, 'next_cursor': next_cursor})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_password_reset_request_view(request):
    """
    Request a password reset code. Accepts email.
    Always returns success to avoid leaking whether an account exists.
    """
    email = request.data.get('email', '').strip().lower()
    if not email:
        return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Don't reveal whether the email is registered
        return Response({'detail': 'If that email is registered, a reset code has been sent.'})

    code = str(secrets.randbelow(900000) + 100000)
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    user.password_reset_token = code_hash
    user.password_reset_token_expires = timezone.now() + timedelta(minutes=15)
    user.save(update_fields=['password_reset_token', 'password_reset_token_expires'])
    _send_password_reset_email(user, code)

    return Response({'detail': 'If that email is registered, a reset code has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_password_reset_confirm_view(request):
    """
    Confirm a password reset. Accepts email, code, and new_password.
    Verifies the code, validates the new password, and updates the user.
    """
    email = request.data.get('email', '').strip().lower()
    code = str(request.data.get('code', '')).strip()
    new_password = request.data.get('new_password', '')

    if not email or not code or not new_password:
        return Response(
            {'error': 'Email, code, and new_password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid or expired reset code.'}, status=status.HTTP_400_BAD_REQUEST)

    if not user.password_reset_token or not user.password_reset_token_expires:
        return Response(
            {'error': 'No reset code found. Please request a new one.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if timezone.now() > user.password_reset_token_expires:
        return Response(
            {'error': 'Reset code has expired. Please request a new one.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if hashlib.sha256(code.encode()).hexdigest() != user.password_reset_token:
        return Response({'error': 'Invalid reset code.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user)
    except DjangoValidationError as e:
        return Response({'error': e.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.password_reset_token = None
    user.password_reset_token_expires = None
    user.save(update_fields=['password', 'password_reset_token', 'password_reset_token_expires'])

    return Response({'detail': 'Password reset successfully. You can now log in.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_suggested_users_view(request):
    """
    Return a ranked list of suggested users to follow.
    Scoring: mutual_count × 1.0 + same_gym × 2.0 + freq_diff_bonus × 0.5
    Fallback for new users: top users by follower count.
    ~6–7 DB queries, no N+1.
    """
    from social.models import Follow
    from django.db.models import Count
    from media.models import MediaLink
    from collections import defaultdict

    me = request.user
    try:
        limit = max(1, min(int(request.GET.get('limit', 20)), 50))
    except (ValueError, TypeError):
        limit = 20

    # Q1: ids of everyone current user already follows
    following_ids = list(Follow.objects.filter(follower=me).values_list('following_id', flat=True))
    excluded = set(following_ids) | {me.id}

    # Q2: second-degree follows with mutual count
    second_degree = (
        Follow.objects.filter(follower_id__in=following_ids)
        .exclude(following_id__in=excluded)
        .values('following_id')
        .annotate(mutual_count=Count('follower_id'))
    )
    mutual_map = {row['following_id']: row['mutual_count'] for row in second_degree}

    # Q3: my gym ids
    my_gym_ids = list(me.enrolled_gyms.values_list('id', flat=True))

    # Q4: gym candidates
    gym_candidate_ids = set()
    if my_gym_ids:
        gym_candidate_ids = set(
            User.objects.filter(enrolled_gyms__in=my_gym_ids)
            .exclude(id__in=excluded)
            .values_list('id', flat=True)
        )

    candidate_ids = set(mutual_map.keys()) | gym_candidate_ids

    # Fallback: new user with no follows and no gym
    if not candidate_ids:
        fallback_ids = list(
            User.objects.exclude(id__in=excluded)
            .annotate(follower_count=Count('followers'))
            .order_by('-follower_count')
            .values_list('id', flat=True)[:limit * 2]
        )
        candidate_ids = set(fallback_ids)

    if not candidate_ids:
        return Response({'results': []})

    # Q5: fetch candidate details
    candidates = {
        u.id: u for u in
        User.objects.filter(id__in=candidate_ids)
        .only('id', 'username', 'display_name', 'avatar', 'workout_frequency')
    }

    # Score and rank
    scored = []
    for cid, candidate in candidates.items():
        mutual_count = mutual_map.get(cid, 0)
        same_gym = 1.0 if cid in gym_candidate_ids else 0.0
        freq_bonus = 0.5 if abs(candidate.workout_frequency - me.workout_frequency) <= 1 else 0.0
        score = mutual_count * 3.0 + same_gym * 1.0 + freq_bonus
        scored.append((score, cid))

    scored.sort(key=lambda x: -x[0])
    top_ids = [cid for _, cid in scored[:limit]]

    # Q6: bulk fetch connectors (people I follow who also follow a candidate)
    connectors_by_candidate: dict = defaultdict(list)
    if following_ids and top_ids:
        connector_follows = list(
            Follow.objects.filter(follower_id__in=following_ids, following_id__in=top_ids)
            .select_related('follower')[:3 * limit]
        )
        for f in connector_follows:
            bucket = connectors_by_candidate[f.following_id]
            if len(bucket) < 3:
                bucket.append(f.follower)

    # Q7: bulk fetch avatar URLs (avoids N+1 via user.avatar_url)
    all_avatar_ids = set(top_ids)
    for connectors in connectors_by_candidate.values():
        for c in connectors:
            all_avatar_ids.add(c.id)

    avatar_url_map = {
        link.destination_id: link.asset.url
        for link in MediaLink.objects.filter(
            destination_type='user',
            destination_id__in=[str(uid) for uid in all_avatar_ids],
            type='avatar',
        ).select_related('asset')
    }

    def _avatar(user_obj):
        url = avatar_url_map.get(str(user_obj.id))
        if url:
            return url
        if user_obj.avatar:
            from media.utils import build_media_url
            return build_media_url(user_obj.avatar.name)
        return None

    # Build response
    results = []
    for cid in top_ids:
        if cid not in candidates:
            continue
        candidate = candidates[cid]
        connectors = connectors_by_candidate.get(cid, [])
        mutual_previews = [
            {'id': str(c.id), 'username': c.username, 'avatar_url': _avatar(c)}
            for c in connectors
        ]
        results.append({
            'id': str(candidate.id),
            'username': candidate.username,
            'display_name': candidate.display_name,
            'avatar_url': _avatar(candidate),
            'is_following': False,
            'mutual_count': mutual_map.get(cid, 0),
            'mutual_previews': mutual_previews,
        })

    return Response({'results': results})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def api_google_auth_view(request):
    """
    Authenticate via Google Sign-In.
    Accepts a Google ID token from the mobile client, verifies it, then
    finds or creates a Spottr account linked to that Google identity.

    Required env var: GOOGLE_CLIENT_ID (your Web OAuth client ID from Google Cloud Console).
    """
    from django.conf import settings
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests

    id_token_str = request.data.get('id_token', '').strip()
    if not id_token_str:
        return Response({'error': 'id_token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
    if not client_id:
        return Response(
            {'error': 'Google authentication is not configured on this server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            client_id,
        )
    except ValueError as e:
        logger.warning('Google ID token verification failed: %s', e)
        return Response({'error': 'Invalid Google token.'}, status=status.HTTP_401_UNAUTHORIZED)

    google_id = idinfo['sub']
    email = idinfo.get('email', '').lower()
    email_verified = idinfo.get('email_verified', False)
    name = idinfo.get('name', '')

    if not email or not email_verified:
        return Response(
            {'error': 'Google account must have a verified email address.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 1. Try to find existing account linked to this Google ID
    user = User.objects.filter(google_id=google_id).first()

    # 2. Fall back to matching by email (link existing account on first Google sign-in)
    if user is None:
        user = User.objects.filter(email=email).first()
        if user is not None:
            user.google_id = google_id
            user.save(update_fields=['google_id'])

    # 3. Create a new account
    if user is None:
        import re as _re
        # Derive a username from the Google display name or email local part
        base = _re.sub(r'[^a-z0-9_.]', '', name.lower().replace(' ', '_')) or email.split('@')[0]
        base = base[:28] or 'user'
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists() or username in RESERVED_USERNAMES:
            username = f'{base}{suffix}'
            suffix += 1

        user = User.objects.create(
            email=email,
            username=username,
            display_name=name,
            google_id=google_id,
            is_email_verified=True,
            onboarding_step=1,      # Skip email verification; still needs display_name etc.
            birthday=date(2000, 1, 1),  # Placeholder — user can update in onboarding
        )
        user.set_unusable_password()
        user.save(update_fields=['password'])

    if not user.is_active:
        return Response({'error': 'Account is deactivated.'}, status=status.HTTP_403_FORBIDDEN)

    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': _user_brief(user)})
