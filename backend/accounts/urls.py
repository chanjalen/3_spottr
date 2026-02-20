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
    path('api/pr/save/', views.save_pr_view, name='save_pr'),
    path('api/pr/delete/', views.delete_pr_view, name='delete_pr'),
    # Mobile API endpoints
    path('api/login/', api_views.api_login_view, name='api_login'),
    path('api/signup/', api_views.api_signup_view, name='api_signup'),
    path('api/me/', api_views.api_me_view, name='api_me'),
    path('api/profile/<str:username>/', api_views.api_profile_view, name='api_profile'),
]