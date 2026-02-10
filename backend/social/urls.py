from django.urls import path

from . import views

app_name = 'social'

urlpatterns = [
    path('feed/', views.feed_view, name='feed'),
    path('checkin/create/', views.create_checkin_view, name='create_checkin'),
]
