from django import forms
from .models import User


class SignUpForm(forms.ModelForm):
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'Password'}),
    )
    password_confirm = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'Confirm password'}),
        label='Confirm Password',
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'phone_number', 'display_name', 'birthday']
        widgets = {
            'username': forms.TextInput(attrs={'placeholder': 'Username'}),
            'email': forms.EmailInput(attrs={'placeholder': 'Email'}),
            'phone_number': forms.TextInput(attrs={'placeholder': 'Phone number'}),
            'display_name': forms.TextInput(attrs={'placeholder': 'Display name'}),
            'birthday': forms.DateInput(attrs={'type': 'date'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('password')
        password_confirm = cleaned_data.get('password_confirm')

        if password and password_confirm and password != password_confirm:
            self.add_error('password_confirm', 'Passwords do not match.')

        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data['password'])
        if commit:
            user.save()
        return user


class LoginForm(forms.Form):
    username = forms.CharField(
        widget=forms.TextInput(attrs={'placeholder': 'Username'}),
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'Password'}),
    )


class EditProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['display_name', 'username', 'bio', 'avatar']
        widgets = {
            'display_name': forms.TextInput(attrs={'placeholder': 'Display name'}),
            'username': forms.TextInput(attrs={'placeholder': 'username'}),
            'bio': forms.Textarea(attrs={'placeholder': 'Tell us about yourself...', 'rows': 4}),
        }


class AccountSettingsForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['email', 'phone_number', 'birthday']
        widgets = {
            'email': forms.EmailInput(),
            'phone_number': forms.TextInput(),
            'birthday': forms.DateInput(attrs={'type': 'date'}),
        }


class ChangePasswordForm(forms.Form):
    current_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'Current password'}),
    )
    new_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'New password'}),
    )
    confirm_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': 'Confirm new password'}),
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

    def clean_current_password(self):
        current = self.cleaned_data.get('current_password')
        if self.user and not self.user.check_password(current):
            raise forms.ValidationError('Current password is incorrect.')
        return current

    def clean(self):
        cleaned_data = super().clean()
        new_pw = cleaned_data.get('new_password')
        confirm = cleaned_data.get('confirm_password')
        if new_pw and confirm and new_pw != confirm:
            self.add_error('confirm_password', 'Passwords do not match.')
        return cleaned_data

    def save(self):
        self.user.set_password(self.cleaned_data['new_password'])
        self.user.save()


class PreferencesForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['weekly_workout_goal', 'weight_unit', 'distance_unit']
        widgets = {
            'weekly_workout_goal': forms.Select(choices=[
                (1, '1 day per week'), (2, '2 days per week'), (3, '3 days per week'),
                (4, '4 days per week'), (5, '5 days per week'), (6, '6 days per week'),
                (7, '7 days per week'),
            ]),
        }


class PrivacyForm(forms.ModelForm):
    class Meta:
        model = User
        fields = [
            'profile_visibility', 'workout_post_visibility',
            'show_streak', 'show_personal_records',
            'allow_friend_requests', 'show_online_status',
        ]


class NotificationsForm(forms.ModelForm):
    class Meta:
        model = User
        fields = [
            'notify_friend_workouts', 'notify_zaps', 'notify_comments',
            'notify_reactions', 'notify_friend_requests',
            'notify_workout_reminders', 'notify_workout_invites',
            'notify_group_messages', 'notify_leaderboard_updates',
            'push_notifications', 'email_notifications',
        ]