from django.urls import path
from . import views

app_name = 'gyms-api'

urlpatterns = [
    path('gyms/', views.gym_list, name='gym-list'),
    path('gyms/<str:gym_id>/', views.gym_detail, name='gym-detail'),
    path('gyms/<str:gym_id>/enroll/', views.gym_enroll, name='gym-enroll'),
    path('gyms/<str:gym_id>/busy-level/', views.gym_busy_level, name='gym-busy-level'),
    path('gyms/<str:gym_id>/leaderboard/', views.gym_leaderboard, name='gym-leaderboard'),
    path('unenroll/', views.gym_unenroll, name='gym-unenroll'),
    path('me/gym/', views.gym_current, name='gym-current'),

    # Workout Invites
    path('invites/', views.invite_list_create, name='invite-list-create'),
    path('invites/<str:invite_id>/', views.invite_detail_cancel, name='invite-detail-cancel'),

    # Join Requests
    path('invites/<str:invite_id>/join/', views.join_request_create, name='join-request-create'),
    path('invites/<str:invite_id>/requests/', views.join_request_list, name='join-request-list'),
    path('invites/requests/<str:request_id>/accept/', views.join_request_accept, name='join-request-accept'),
    path('invites/requests/<str:request_id>/deny/', views.join_request_deny, name='join-request-deny'),
    path('invites/requests/<str:request_id>/cancel/', views.join_request_cancel, name='join-request-cancel'),
]
