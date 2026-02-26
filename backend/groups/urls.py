from django.urls import path
from . import views

app_name = 'groups'

urlpatterns = [
    path('<str:group_id>/', views.group_profile_view, name='group_profile'),
]
