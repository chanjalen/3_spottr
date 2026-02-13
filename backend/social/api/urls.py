from django.urls import path
from . import views

app_name = 'social-api'

urlpatterns = [
    path('new-followers/', views.new_followers, name='new-followers'),
    path('mutual-follows/', views.mutual_follows, name='mutual-follows'),
]
