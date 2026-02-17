from django.urls import path
from . import views

app_name = 'groups-api'

urlpatterns = [
    # Group CRUD
    path('', views.group_list, name='group-list'),
    path('create/', views.group_create, name='group-create'),
    path('me/', views.my_groups, name='my-groups'),
    path('<str:group_id>/', views.group_detail, name='group-detail'),
    path('<str:group_id>/update/', views.group_update, name='group-update'),
    path('<str:group_id>/delete/', views.group_delete, name='group-delete'),

    # Streak
    path('<str:group_id>/streak/', views.group_streak_detail, name='group-streak-detail'),

    # Membership
    path('<str:group_id>/members/', views.member_list, name='member-list'),
    path('<str:group_id>/join/', views.group_join, name='group-join'),
    path('<str:group_id>/leave/', views.group_leave, name='group-leave'),
    path('<str:group_id>/members/<str:user_id>/add/', views.member_add, name='member-add'),
    path('<str:group_id>/members/<str:user_id>/remove/', views.member_remove, name='member-remove'),
    path('<str:group_id>/members/<str:user_id>/promote/', views.member_promote, name='member-promote'),
    path('<str:group_id>/members/<str:user_id>/demote/', views.member_demote, name='member-demote'),

    # Invite codes
    path('<str:group_id>/invite-codes/', views.invite_code_list_create, name='invite-code-list-create'),
    path('<str:group_id>/invite-codes/<str:code_id>/deactivate/', views.invite_code_deactivate, name='invite-code-deactivate'),
    path('join-via-code/', views.join_via_code, name='join-via-code'),

    # Join requests (private groups)
    path('<str:group_id>/join-requests/', views.join_request_list, name='join-request-list'),
    path('<str:group_id>/join-requests/create/', views.join_request_create, name='join-request-create'),
    path('<str:group_id>/join-requests/<str:request_id>/accept/', views.join_request_accept, name='join-request-accept'),
    path('<str:group_id>/join-requests/<str:request_id>/deny/', views.join_request_deny, name='join-request-deny'),
]
