from django.urls import path
from . import views

app_name = 'media'

urlpatterns = [
    path('upload/', views.upload_media, name='upload'),
]
