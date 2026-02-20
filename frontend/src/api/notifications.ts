import { apiClient } from './client';
import { Notification } from '../types/notification';

export async function fetchNotifications(): Promise<Notification[]> {
  const res = await apiClient.get('/api/notifications/');
  return res.data;
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  const res = await apiClient.get('/api/notifications/unread-count/');
  return res.data;
}

export async function markRead(ids: number[]): Promise<void> {
  await apiClient.post('/api/notifications/mark-read/', { ids });
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/api/notifications/mark-all-read/');
}
