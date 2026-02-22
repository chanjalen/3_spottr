import { apiClient } from './client';
import { Conversation, GroupConversation, Message, MessagePage, UnreadCount } from '../types/messaging';

export async function fetchDMConversations(): Promise<Conversation[]> {
  const res = await apiClient.get('/api/messaging/dm/conversations/');
  return res.data;
}

export async function fetchGroupConversations(): Promise<GroupConversation[]> {
  const res = await apiClient.get('/api/messaging/groups/conversations/');
  return res.data;
}

export async function fetchDMMessages(
  partnerId: string,
  params?: { before_id?: string; after_id?: string; limit?: number },
): Promise<MessagePage> {
  const res = await apiClient.get(`/api/messaging/dm/${partnerId}/`, { params });
  return res.data as MessagePage;
}

export async function fetchGroupMessages(
  groupId: string,
  params?: { before_id?: string; after_id?: string; limit?: number },
): Promise<MessagePage> {
  const res = await apiClient.get(`/api/messaging/groups/${groupId}/messages/`, { params });
  return res.data as MessagePage;
}

export async function sendDM(recipientId: string, content: string): Promise<Message> {
  const res = await apiClient.post('/api/messaging/dm/send/', { recipient_id: recipientId, content });
  return res.data;
}

export async function sendGroupMessage(groupId: string, content: string): Promise<Message> {
  const res = await apiClient.post(`/api/messaging/groups/${groupId}/send/`, { content });
  return res.data;
}

export async function sendZap(recipientId: string): Promise<void> {
  await apiClient.post(`/api/messaging/zap/${recipientId}/`);
}

export async function markMessagesRead(messageIds: string[]): Promise<void> {
  await apiClient.post('/api/messaging/read/', { message_ids: messageIds });
}

export async function fetchUnreadCount(): Promise<UnreadCount> {
  const res = await apiClient.get('/api/messaging/unread-count/');
  return res.data;
}
