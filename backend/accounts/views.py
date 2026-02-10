from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required

from .forms import (
    SignUpForm, LoginForm, EditProfileForm,
    AccountSettingsForm, ChangePasswordForm,
    PreferencesForm, PrivacyForm, NotificationsForm,
)
from .models import User
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
    user_posts = get_user_posts(request.user)
    return render(request, 'accounts/profile.html', {
        'profile_user': request.user,
        'is_own_profile': True,
        'user_posts': user_posts,
    })


def user_profile_view(request, username):
    profile_user = get_object_or_404(User, username=username)
    is_own_profile = request.user.is_authenticated and request.user.pk == profile_user.pk
    user_posts = get_user_posts(profile_user)
    return render(request, 'accounts/profile.html', {
        'profile_user': profile_user,
        'is_own_profile': is_own_profile,
        'user_posts': user_posts,
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