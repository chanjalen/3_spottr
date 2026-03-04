import { apiClient } from './client';
import { Notification } from '../types/notification';

export async function fetchNotifications(): Promise<Notification[]> {
  const res = await apiClient.get('/api/notifications/');
  return res.data.notifications ?? [];
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  const res = await apiClient.get('/api/notifications/unread-count/');
  return res.data;
}

export async function markRead(ids: string[]): Promise<void> {
  await apiClient.post('/api/notifications/mark-read/', { ids });
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/api/notifications/mark-all-read/');
}

export async function clearAllNotifications(): Promise<void> {
  await apiClient.post('/api/notifications/clear-all/');
}

export async function dismissNotification(ids: string[]): Promise<void> {
  await apiClient.post('/api/notifications/dismiss/', { ids });
}

export async function acceptWorkoutInvite(inviteId: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/${inviteId}/join/`);
}

export async function declineWorkoutInvite(inviteId: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/${inviteId}/decline/`);
}

export async function acceptGroupJoinRequest(groupId: string, requestId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join-requests/${requestId}/accept/`);
}

export async function denyGroupJoinRequest(groupId: string, requestId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join-requests/${requestId}/deny/`);
}

export async function acceptWorkoutJoinRequest(requestId: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/requests/${requestId}/accept/`);
}

export async function denyWorkoutJoinRequest(requestId: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/requests/${requestId}/deny/`);
}
