import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { FeedItem } from '../types/feed';

export async function fetchFeed(tab: 'main' | 'friends'): Promise<FeedItem[]> {
  const response = await apiClient.get(ENDPOINTS.feed, {
    params: { tab },
  });
  return response.data;
}

export async function toggleLike(
  itemId: number,
  itemType: 'post' | 'checkin',
): Promise<{ liked: boolean; like_count: number }> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.likePost(itemId)
      : ENDPOINTS.likeCheckin(itemId);
  const response = await apiClient.post(endpoint);
  return response.data;
}

export async function deletePost(id: number): Promise<void> {
  await apiClient.post(ENDPOINTS.deletePost(id));
}

export async function deleteCheckin(id: number): Promise<void> {
  await apiClient.post(ENDPOINTS.deleteCheckin(id));
}
