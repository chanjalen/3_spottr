from django.urls import path
from . import views

app_name = 'messaging-api'

urlpatterns = [
    # Send messages
    path('zap/<str:recipient_id>/', views.send_zap, name='send-zap'),
    path('dm/send/', views.send_dm, name='send-dm'),
    path('groups/<str:group_id>/send/', views.send_group_message, name='send-group-message'),
    path('groups/<str:group_id>/zap/<str:target_user_id>/', views.send_group_zap, name='send-group-zap'),

    # Conversation lists
    path('dm/conversations/', views.dm_conversations, name='dm-conversations'),
    path('groups/conversations/', views.group_conversations, name='group-conversations'),

    # Message history
    path('dm/<str:partner_id>/', views.dm_messages, name='dm-messages'),
    path('groups/<str:group_id>/messages/', views.group_messages, name='group-messages'),

    # Read receipts
    path('read/', views.mark_read, name='mark-read'),
    path('unread-count/', views.unread_count, name='unread-count'),
]
