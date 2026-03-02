from django.urls import path
from . import views
from .api import views as api_views

app_name = 'accounts'

urlpatterns = [
    path('signup/', views.signup_view, name='signup'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.profile_view, name='profile'),
    path('profile/<str:username>/', views.user_profile_view, name='user_profile'),
    path('edit/', views.edit_profile_view, name='edit_profile'),
    path('delete-account/', views.delete_account_view, name='delete_account'),
    path('api/search-users/', views.search_users_view, name='search_users'),
    path('api/follow-toggle/', views.follow_toggle_view, name='follow_toggle'),
    path('api/block-toggle/', views.block_toggle_view, name='block_toggle'),
    path('api/followers/', views.followers_list_view, name='followers_list'),
    path('api/following/', views.following_list_view, name='following_list'),
    path('api/pr/save/', api_views.api_save_pr_view, name='api_save_pr'),
    path('api/pr/delete/', api_views.api_delete_pr_view, name='api_delete_pr'),
    # Mobile API endpoints
    path('api/login/', api_views.api_login_view, name='api_login'),
    path('api/signup/', api_views.api_signup_view, name='api_signup'),
    path('api/verify-email/', api_views.api_verify_email_view, name='api_verify_email'),
    path('api/resend-verification/', api_views.api_resend_verification_view, name='api_resend_verification'),
    path('api/onboarding/', api_views.api_onboarding_view, name='api_onboarding'),
    path('api/username-available/', api_views.api_username_available_view, name='api_username_available'),
    path('api/me/', api_views.api_me_view, name='api_me'),
    path('api/me/delete/', api_views.api_delete_account_view, name='api_delete_account'),
    path('api/me/avatar/', api_views.api_update_avatar_view, name='api_update_avatar'),
    path('api/me/profile/', api_views.api_update_profile_view, name='api_update_profile'),
    path('api/profile/<str:username>/', api_views.api_profile_view, name='api_profile'),
    path('api/user/<str:username>/post-thumbnails/', api_views.api_user_post_thumbnails_view, name='api_user_post_thumbnails'),
    path('api/user/<str:username>/posts/', api_views.api_user_posts_view, name='api_user_posts'),
    path('api/user/<str:username>/prs/', api_views.api_user_prs_view, name='api_user_prs'),
    path('api/user/<str:username>/checkins/', api_views.api_user_checkins_view, name='api_user_checkins'),
]