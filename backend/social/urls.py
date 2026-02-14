from django.urls import path

from . import views

app_name = 'social'

urlpatterns = [
    path('', views.social_view, name='social'),
    path('feed/', views.feed_view, name='feed'),
    path('checkin/create/', views.create_checkin_view, name='create_checkin'),

    # Post likes
    path('post/<str:post_id>/like/', views.toggle_like_post_view, name='toggle_like_post'),

    # Check-in likes
    path('checkin/<str:checkin_id>/like/', views.toggle_like_checkin_view, name='toggle_like_checkin'),

    # Comment likes
    path('comment/<str:comment_id>/like/', views.toggle_like_comment_view, name='toggle_like_comment'),

    # Post comments
    path('post/<str:post_id>/comments/', views.get_comments_view, name='get_comments'),
    path('post/<str:post_id>/comments/add/', views.add_comment_view, name='add_comment'),

    # Check-in comments
    path('checkin/<str:checkin_id>/comments/', views.get_checkin_comments_view, name='get_checkin_comments'),
    path('checkin/<str:checkin_id>/comments/add/', views.add_checkin_comment_view, name='add_checkin_comment'),

    # Delete post / check-in
    path('post/<str:post_id>/delete/', views.delete_post_view, name='delete_post'),
    path('checkin/<str:checkin_id>/delete/', views.delete_checkin_view, name='delete_checkin'),

    # Delete comment
    path('comment/<str:comment_id>/delete/', views.delete_comment_view, name='delete_comment'),

    # Comment replies
    path('comment/<str:comment_id>/replies/', views.get_comment_replies_view, name='get_comment_replies'),
    path('comment/<str:comment_id>/replies/add/', views.add_comment_reply_view, name='add_comment_reply'),

    # Create post
    path('post/create/', views.create_post_view, name='create_post'),

    # Poll voting
    path('poll/<str:poll_id>/vote/', views.vote_poll_view, name='vote_poll'),
]
