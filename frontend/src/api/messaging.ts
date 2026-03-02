import { apiClient } from './client';
import { Conversation, GroupConversation, Message, MessagePage, MessageReaction, UnreadCount } from '../types/messaging';

export interface ReactionDetail {
  emoji: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

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

export async function sendDM(recipientId: string, content: string, mediaId?: string): Promise<Message> {
  const payload: Record<string, string> = { recipient_id: recipientId, content };
  if (mediaId) payload.media_id = mediaId;
  const res = await apiClient.post('/api/messaging/dm/send/', payload);
  return res.data;
}

export async function sendGroupMessage(groupId: string, content: string, mediaId?: string): Promise<Message> {
  const payload: Record<string, string> = { content };
  if (mediaId) payload.media_id = mediaId;
  const res = await apiClient.post(`/api/messaging/groups/${groupId}/send/`, payload);
  return res.data;
}

export async function sendZap(recipientId: string): Promise<void> {
  await apiClient.post(`/api/messaging/zap/${recipientId}/`);
}

export async function sendGroupZap(groupId: string, targetUserId: string): Promise<Message> {
  const res = await apiClient.post(`/api/messaging/groups/${groupId}/zap/${targetUserId}/`);
  return res.data;
}

export async function markMessagesRead(messageIds: string[]): Promise<void> {
  await apiClient.post('/api/messaging/read/', { message_ids: messageIds });
}

export async function fetchUnreadCount(): Promise<UnreadCount> {
  const res = await apiClient.get('/api/messaging/unread-count/');
  return res.data;
}

export async function reactToMessage(
  messageId: string,
  emoji: string,
): Promise<{ reactions: MessageReaction[] }> {
  const res = await apiClient.post(`/api/messaging/messages/${messageId}/react/`, { emoji });
  return res.data;
}

export async function fetchMessageReactionDetails(messageId: string): Promise<ReactionDetail[]> {
  const res = await apiClient.get(`/api/messaging/messages/${messageId}/reactions/`);
  return res.data;
}
