from django.urls import path
from . import views

app_name = 'organizations-api'

urlpatterns = [
    # Org list / create / discover
    path('', views.org_list_create, name='org-list-create'),
    path('user/<str:username>/orgs/', views.user_orgs, name='user-orgs'),
    path('discover/', views.org_discover, name='org-discover'),
    path('join-via-code/', views.join_via_code, name='join-via-code'),

    # Org detail / update / delete
    path('<str:org_id>/', views.org_detail, name='org-detail'),
    path('<str:org_id>/avatar/', views.org_avatar, name='org-avatar'),

    # Membership
    path('<str:org_id>/members/', views.org_members, name='org-members'),
    path('<str:org_id>/members/add/', views.member_add, name='member-add'),
    path('<str:org_id>/join/', views.org_join, name='org-join'),
    path('<str:org_id>/leave/', views.org_leave, name='org-leave'),
    path('<str:org_id>/members/<str:user_id>/promote/', views.member_promote, name='member-promote'),
    path('<str:org_id>/members/<str:user_id>/demote/', views.member_demote, name='member-demote'),
    path('<str:org_id>/members/<str:user_id>/kick/', views.member_kick, name='member-kick'),

    # Invite codes
    path('<str:org_id>/invite-codes/', views.invite_codes, name='invite-codes'),
    path('<str:org_id>/invite-codes/<str:code_id>/deactivate/', views.deactivate_invite_code, name='deactivate-invite-code'),

    # Join requests
    path('<str:org_id>/request/', views.create_join_request, name='create-join-request'),
    path('<str:org_id>/requests/', views.list_join_requests, name='list-join-requests'),
    path('requests/<str:request_id>/accept/', views.accept_join_request, name='accept-join-request'),
    path('requests/<str:request_id>/deny/', views.deny_join_request, name='deny-join-request'),

    # Member activity / logs / status (admin only)
    path('<str:org_id>/member-activity/', views.member_activity, name='member-activity'),
    path('<str:org_id>/member-logs/', views.member_logs, name='member-logs'),
    path('<str:org_id>/member-status/', views.member_status, name='member-status'),

    # Announcements
    path('<str:org_id>/announcements/', views.announcements, name='announcements'),
    path('<str:org_id>/announcements/read/', views.mark_announcements_read, name='announcements-read'),
    path('<str:org_id>/announcements/<str:announcement_id>/', views.announcement_delete, name='announcement-delete'),
    path('<str:org_id>/announcements/<str:announcement_id>/react/', views.announcement_react, name='announcement-react'),
    path('<str:org_id>/announcements/<str:announcement_id>/reactions/', views.announcement_reaction_details, name='announcement-reaction-details'),
    path('<str:org_id>/announcements/<str:announcement_id>/vote/', views.announcement_vote, name='announcement-vote'),
    path('<str:org_id>/announcements/<str:announcement_id>/poll/voters/', views.announcement_poll_voters, name='announcement-poll-voters'),
]
