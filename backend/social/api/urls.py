from django.urls import path
from . import views

app_name = 'social-api'

urlpatterns = [
    path('new-followers/', views.new_followers, name='new-followers'),
    path('mutual-follows/', views.mutual_follows, name='mutual-follows'),
    path('leaderboard/', views.leaderboard, name='leaderboard'),
    path('post/create/', views.create_post, name='create-post'),
    path('posts/<str:post_id>/', views.post_detail, name='post-detail'),
    path('checkin/create/', views.create_checkin, name='create-checkin'),
    path('post/<str:post_id>/like/', views.like_post, name='like-post'),
    path('post/<str:post_id>/likers/', views.post_likers, name='post-likers'),
    path('checkin/<str:checkin_id>/like/', views.like_checkin, name='like-checkin'),
    path('checkin/<str:checkin_id>/likers/', views.checkin_likers, name='checkin-likers'),
    path('poll/<str:poll_id>/vote/', views.vote_poll, name='vote-poll'),
    path('poll/<str:poll_id>/voters/', views.poll_voters, name='poll-voters'),
    path('share/recipients/', views.ShareRecipientsView.as_view(), name='share-recipients'),
    path('share/send/', views.SharePostView.as_view(), name='share-send'),
    path('share/send-profile/', views.ShareProfileView.as_view(), name='share-send-profile'),
]
