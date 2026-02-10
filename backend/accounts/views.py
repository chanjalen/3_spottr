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
    user_posts = get_user_posts(user)
    following_count = Follow.objects.filter(follower=user).count()
    followers_count = Follow.objects.filter(following=user).count()
    return render(request, 'accounts/profile.html', {
        'profile_user': user,
        'is_own_profile': True,
        'user_posts': user_posts,
        'following_count': following_count,
        'followers_count': followers_count,
    })


def user_profile_view(request, username):
    profile_user = get_object_or_404(User, username=username)
    is_own_profile = request.user.is_authenticated and request.user.pk == profile_user.pk
    user_posts = get_user_posts(profile_user)
    following_count = Follow.objects.filter(follower=profile_user).count()
    followers_count = Follow.objects.filter(following=profile_user).count()
    is_following = False
    is_blocked = False
    if request.user.is_authenticated and not is_own_profile:
        is_following = Follow.objects.filter(follower=request.user, following=profile_user).exists()
        is_blocked = Block.objects.filter(blocker=request.user, blocked=profile_user).exists()
    return render(request, 'accounts/profile.html', {
        'profile_user': profile_user,
        'is_own_profile': is_own_profile,
        'user_posts': user_posts,
        'following_count': following_count,
        'followers_count': followers_count,
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
            'avatar_url': u.avatar.url if u.avatar else '',
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
    if not user_id:
        return JsonResponse({'error': 'user_id required'}, status=400)

    target = get_object_or_404(User, pk=user_id)
    if target.pk == request.user.pk:
        return JsonResponse({'error': 'Cannot follow yourself'}, status=400)

    action_type = request.POST.get('action', '')

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

    return JsonResponse({
        'action': action,
        'followers_count': Follow.objects.filter(following=request.user).count(),
        'following_count': Follow.objects.filter(follower=request.user).count(),
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
        'followers_count': Follow.objects.filter(following=target).count(),
        'following_count': Follow.objects.filter(follower=request.user).count(),
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
            'avatar_url': u.avatar.url if u.avatar else '',
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
            'avatar_url': u.avatar.url if u.avatar else '',
            'is_blocked': u.pk in blocked_ids,
        })
    return JsonResponse({'results': results})