from django.urls import path
from . import views

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
]