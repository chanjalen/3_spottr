import json

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db.models import Q

from .forms import (
    SignUpForm, LoginForm, EditProfileForm,
    AccountSettingsForm, ChangePasswordForm,
    PreferencesForm, PrivacyForm, NotificationsForm,
)
from .models import User
from social.models import Follow, Block
from social.views import get_user_posts
from workouts.models import PersonalRecord


def get_friends_count(user):
    """Count mutual follows (both users follow each other)."""
    following_ids = set(Follow.objects.filter(follower=user).values_list('following_id', flat=True))
    follower_ids = set(Follow.objects.filter(following=user).values_list('follower_id', flat=True))
    return len(following_ids & follower_ids)


def signup_view(request):
    if request.user.is_authenticated:
        return redirect('accounts:profile')

    if request.method == 'POST':
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('accounts:profile')
    else:
        form = SignUpForm()

    return render(request, 'accounts/signup.html', {'form': form})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('accounts:profile')

    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                request,
                username=form.cleaned_data['username'],
                password=form.cleaned_data['password'],
            )
            if user is not None:
                login(request, user)
                next_url = request.GET.get('next', '/')
                return redirect(next_url)
            else:
                form.add_error(None, 'Invalid username or password.')
    else:
        form = LoginForm()

    return render(request, 'accounts/login.html', {'form': form})


def logout_view(request):
    logout(request)
    return redirect('accounts:login')


@login_required
def profile_view(request):
    user = request.user
    user_posts = get_user_posts(user, viewer=request.user)
    following_count = Follow.objects.filter(follower=user).count()
    followers_count = Follow.objects.filter(following=user).count()
    friends_count = get_friends_count(user)
    personal_records = PersonalRecord.objects.filter(user=user)
    return render(request, 'accounts/profile.html', {
        'profile_user': user,
        'is_own_profile': True,
        'user_posts': user_posts,
        'following_count': following_count,
        'followers_count': followers_count,
        'friends_count': friends_count,
        'personal_records': personal_records,
    })


def user_profile_view(request, username):
    profile_user = get_object_or_404(User, username=username)
    is_own_profile = request.user.is_authenticated and request.user.pk == profile_user.pk
    is_following = False
    is_blocked = False
    blocked_by_them = False

    if request.user.is_authenticated and not is_own_profile:
        is_following = Follow.objects.filter(follower=request.user, following=profile_user).exists()
        is_blocked = Block.objects.filter(blocker=request.user, blocked=profile_user).exists()
        blocked_by_them = Block.objects.filter(blocker=profile_user, blocked=request.user).exists()

    # If they blocked you, show unavailable page
    if blocked_by_them:
        return render(request, 'accounts/profile_unavailable.html', {
            'profile_user': profile_user,
        })

    user_posts = get_user_posts(profile_user, viewer=request.user)
    following_count = Follow.objects.filter(follower=profile_user).count()
    followers_count = Follow.objects.filter(following=profile_user).count()
    friends_count = get_friends_count(profile_user)
    personal_records = PersonalRecord.objects.filter(user=profile_user)
    return render(request, 'accounts/profile.html', {
        'profile_user': profile_user,
        'is_own_profile': is_own_profile,
        'user_posts': user_posts,
        'following_count': following_count,
        'followers_count': followers_count,
        'friends_count': friends_count,
        'personal_records': personal_records,
        'is_following': is_following,
        'is_blocked': is_blocked,
    })


@login_required
def edit_profile_view(request):
    user = request.user
    active_tab = request.GET.get('tab', 'profile')
    password_changed = False
    password_error = None

    # Initialize all forms with current user data
    profile_form = EditProfileForm(instance=user)
    account_form = AccountSettingsForm(instance=user)
    password_form = ChangePasswordForm(user=user)
    preferences_form = PreferencesForm(instance=user)
    privacy_form = PrivacyForm(instance=user)
    notifications_form = NotificationsForm(instance=user)

    if request.method == 'POST':
        submitted_tab = request.POST.get('tab', 'profile')
        active_tab = submitted_tab

        if submitted_tab == 'profile':
            profile_form = EditProfileForm(request.POST, request.FILES, instance=user)
            if profile_form.is_valid():
                profile_form.save()
                # If avatar was uploaded, track in MediaAsset/MediaLink
                if 'avatar' in request.FILES and user.avatar:
                    from media.utils import create_media_asset
                    from media.models import MediaLink, MediaAsset
                    # Remove old avatar MediaLink/MediaAsset
                    old_links = MediaLink.objects.filter(
                        destination_type='user',
                        destination_id=str(user.pk),
                        type='avatar',
                    ).select_related('asset')
                    for ml in old_links:
                        ml.asset.delete()
                    # Create new ones
                    asset = create_media_asset(user, request.FILES['avatar'], user.avatar.name, 'image', already_saved=True)
                    MediaLink.objects.create(
                        asset=asset,
                        destination_type='user',
                        destination_id=str(user.pk),
                        type='avatar',
                    )
                return redirect('/accounts/edit/?tab=profile')

        elif submitted_tab == 'account':
            account_form = AccountSettingsForm(request.POST, instance=user)
            if account_form.is_valid():
                account_form.save()
                return redirect('/accounts/edit/?tab=account')

        elif submitted_tab == 'password':
            password_form = ChangePasswordForm(request.POST, user=user)
            active_tab = 'account'
            if password_form.is_valid():
                password_form.save()
                update_session_auth_hash(request, user)
                password_changed = True
            else:
                password_error = password_form.errors

        elif submitted_tab == 'preferences':
            preferences_form = PreferencesForm(request.POST, instance=user)
            if preferences_form.is_valid():
                preferences_form.save()
                return redirect('/accounts/edit/?tab=preferences')

        elif submitted_tab == 'privacy':
            privacy_form = PrivacyForm(request.POST, instance=user)
            if privacy_form.is_valid():
                privacy_form.save()
                return redirect('/accounts/edit/?tab=privacy')

        elif submitted_tab == 'notifications':
            notifications_form = NotificationsForm(request.POST, instance=user)
            if notifications_form.is_valid():
                notifications_form.save()
                return redirect('/accounts/edit/?tab=notifications')

    return render(request, 'accounts/edit_profile.html', {
        'profile_form': profile_form,
        'account_form': account_form,
        'password_form': password_form,
        'preferences_form': preferences_form,
        'privacy_form': privacy_form,
        'notifications_form': notifications_form,
        'active_tab': active_tab,
        'password_changed': password_changed,
        'password_error': password_error,
    })


@login_required
def delete_account_view(request):
    if request.method == 'POST':
        user = request.user
        logout(request)
        user.delete()
        return redirect('home')
    return redirect('/accounts/edit/?tab=account')


@login_required
def search_users_view(request):
    """AJAX endpoint: search users by username or display name."""
    q = request.GET.get('q', '').strip()
    if len(q) < 1:
        return JsonResponse({'results': []})

    users = User.objects.filter(
        Q(username__icontains=q) | Q(display_name__icontains=q)
    ).exclude(pk=request.user.pk)[:10]

    following_ids = set(
        Follow.objects.filter(
            follower=request.user,
            following__in=users,
        ).values_list('following_id', flat=True)
    )

    results = []
    for u in users:
        results.append({
            'id': u.pk,
            'username': u.username,
            'display_name': u.display_name,
            'bio': u.bio or '',
            'avatar_url': u.avatar_url,
            'total_workouts': u.total_workouts,
            'current_streak': u.current_streak,
            'is_following': u.pk in following_ids,
            'followers_count': Follow.objects.filter(following=u).count(),
        })

    return JsonResponse({'results': results})


@login_required
@require_POST
def follow_toggle_view(request):
    """AJAX endpoint: follow/unfollow a user, or remove a follower."""
    user_id = request.POST.get('user_id')
    username = request.POST.get('username')
    action_type = request.POST.get('action', '')

    # Accept JSON body from mobile clients
    if not user_id and not username:
        try:
            body = json.loads(request.body)
            user_id = body.get('user_id')
            username = body.get('username')
            if not action_type:
                action_type = body.get('action', '')
        except (json.JSONDecodeError, AttributeError):
            pass

    if user_id:
        target = get_object_or_404(User, pk=user_id)
    elif username:
        target = get_object_or_404(User, username=username)
    else:
        return JsonResponse({'error': 'user_id or username required'}, status=400)

    if target.pk == request.user.pk:
        return JsonResponse({'error': 'Cannot follow yourself'}, status=400)

    if action_type == 'remove_follower':
        # Remove someone who follows you
        Follow.objects.filter(follower=target, following=request.user).delete()
        action = 'removed'
    else:
        follow, created = Follow.objects.get_or_create(
            follower=request.user, following=target,
        )
        if not created:
            follow.delete()
            action = 'unfollowed'
        else:
            action = 'followed'
            from notifications.dispatcher import notify_follow
            notify_follow(request.user, target)

    return JsonResponse({
        'action': action,
        # Target user's counts
        'target_followers_count': Follow.objects.filter(following=target).count(),
        'target_following_count': Follow.objects.filter(follower=target).count(),
        'target_friends_count': get_friends_count(target),
        # Current (logged-in) user's counts
        'my_followers_count': Follow.objects.filter(following=request.user).count(),
        'my_following_count': Follow.objects.filter(follower=request.user).count(),
        'my_friends_count': get_friends_count(request.user),
    })


@login_required
@require_POST
def block_toggle_view(request):
    """AJAX endpoint: block or unblock a user."""
    user_id = request.POST.get('user_id')
    if not user_id:
        return JsonResponse({'error': 'user_id required'}, status=400)

    target = get_object_or_404(User, pk=user_id)
    if target.pk == request.user.pk:
        return JsonResponse({'error': 'Cannot block yourself'}, status=400)

    block, created = Block.objects.get_or_create(
        blocker=request.user, blocked=target,
    )
    if not created:
        block.delete()
        action = 'unblocked'
    else:
        # Also unfollow if blocking
        Follow.objects.filter(follower=request.user, following=target).delete()
        action = 'blocked'

    return JsonResponse({
        'action': action,
        'is_following': Follow.objects.filter(follower=request.user, following=target).exists(),
        # Target user's counts
        'target_followers_count': Follow.objects.filter(following=target).count(),
        'target_following_count': Follow.objects.filter(follower=target).count(),
        'target_friends_count': get_friends_count(target),
        # Current (logged-in) user's counts
        'my_followers_count': Follow.objects.filter(following=request.user).count(),
        'my_following_count': Follow.objects.filter(follower=request.user).count(),
        'my_friends_count': get_friends_count(request.user),
    })


@login_required
def followers_list_view(request):
    """AJAX endpoint: get list of people who follow the current user."""
    followers = Follow.objects.filter(
        following=request.user
    ).select_related('follower').order_by('-created_at')

    blocked_ids = set(
        Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True)
    )

    results = []
    for f in followers:
        u = f.follower
        results.append({
            'id': u.pk,
            'username': u.username,
            'display_name': u.display_name,
            'avatar_url': u.avatar_url,
            'is_blocked': u.pk in blocked_ids,
        })
    return JsonResponse({'results': results})


@login_required
def following_list_view(request):
    """AJAX endpoint: get list of people the current user follows."""
    following = Follow.objects.filter(
        follower=request.user
    ).select_related('following').order_by('-created_at')

    blocked_ids = set(
        Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True)
    )

    results = []
    for f in following:
        u = f.following
        results.append({
            'id': u.pk,
            'username': u.username,
            'display_name': u.display_name,
            'avatar_url': u.avatar_url,
            'is_blocked': u.pk in blocked_ids,
        })
    return JsonResponse({'results': results})


def parse_pr_value(value, unit):
    """Parse PR value to a comparable number for comparison."""
    try:
        if unit == 'min:sec':
            # Convert time format to total seconds
            parts = value.replace(':', '.').split('.')
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            return float(value) * 60
        return float(value)
    except (ValueError, TypeError):
        return 0


def is_new_pr_better(new_value, new_unit, old_value, old_unit):
    """Check if new PR is better than old PR. For time-based, lower is better. For weight/reps, higher is better."""
    new_num = parse_pr_value(new_value, new_unit)
    old_num = parse_pr_value(old_value, old_unit)

    # For time-based exercises, lower is better
    if new_unit == 'min:sec' or old_unit == 'min:sec':
        return new_num < old_num

    # For weight/reps, higher is better
    return new_num > old_num


@login_required
@require_POST
def save_pr_view(request):
    """AJAX endpoint: create or update a personal record.
    If an existing PR for the same exercise exists, only update if new value is better.
    """
    from django.utils import timezone

    pr_id = request.POST.get('pr_id', '').strip()
    exercise_name = request.POST.get('exercise_name', '').strip()
    value = request.POST.get('value', '').strip()
    unit = request.POST.get('unit', '').strip()
    video = request.FILES.get('video')

    if not exercise_name or not value or not unit:
        return JsonResponse({'error': 'Exercise name, value, and unit are required.'}, status=400)

    if pr_id:
        # Editing an existing PR
        pr = get_object_or_404(PersonalRecord, pk=pr_id, user=request.user)
        pr.exercise_name = exercise_name
        pr.value = value
        pr.unit = unit
        pr.achieved_date = timezone.now().date()
        if video:
            pr.video = video
        pr.save()
    else:
        # Check if there's an existing PR for this exercise
        existing_pr = PersonalRecord.objects.filter(
            user=request.user,
            exercise_name__iexact=exercise_name
        ).first()

        if existing_pr:
            # Compare and only update if new value is better
            if is_new_pr_better(value, unit, existing_pr.value, existing_pr.unit):
                existing_pr.value = value
                existing_pr.unit = unit
                existing_pr.achieved_date = timezone.now().date()
                if video:
                    existing_pr.video = video
                existing_pr.save()
                pr = existing_pr
            else:
                # New value is not better, return info about existing PR
                return JsonResponse({
                    'id': existing_pr.pk,
                    'exercise_name': existing_pr.exercise_name,
                    'value': existing_pr.value,
                    'unit': existing_pr.unit,
                    'has_video': bool(existing_pr.video),
                    'video_url': existing_pr.video.url if existing_pr.video else '',
                    'not_updated': True,
                    'message': f'Your existing PR of {existing_pr.value} {existing_pr.unit} is better!'
                })
        else:
            pr = PersonalRecord.objects.create(
                user=request.user,
                exercise_name=exercise_name,
                value=value,
                unit=unit,
                achieved_date=timezone.now().date(),
                video=video,
            )

    return JsonResponse({
        'id': pr.pk,
        'exercise_name': pr.exercise_name,
        'value': pr.value,
        'unit': pr.unit,
        'has_video': bool(pr.video),
        'video_url': pr.video.url if pr.video else '',
    })


@login_required
@require_POST
def delete_pr_view(request):
    """AJAX endpoint: delete a personal record."""
    pr_id = request.POST.get('pr_id', '').strip()
    if not pr_id:
        return JsonResponse({'error': 'pr_id required'}, status=400)
    pr = get_object_or_404(PersonalRecord, pk=pr_id, user=request.user)
    pr.delete()
    return JsonResponse({'success': True})