from django.urls import path
from . import views

app_name = 'social-api'

urlpatterns = [
    path('new-followers/', views.new_followers, name='new-followers'),
    path('mutual-follows/', views.mutual_follows, name='mutual-follows'),
    path('leaderboard/', views.leaderboard, name='leaderboard'),
    path('post/create/', views.create_post, name='create-post'),
    path('checkin/create/', views.create_checkin, name='create-checkin'),
]
