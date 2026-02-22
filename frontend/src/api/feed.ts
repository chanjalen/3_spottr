import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { FeedItem } from '../types/feed';

/** Normalize a raw backend feed item to the frontend FeedItem shape. */
function adaptFeedItem(raw: any): FeedItem {
  return {
    id: String(raw.id ?? ''),
    type: raw.type === 'workout' ? 'post' : (raw.type ?? 'post'),
    user: {
      id: String(raw.user?.id ?? raw.user?.username ?? ''),
      username: raw.user?.username ?? '',
      display_name: raw.user?.display_name ?? '',
      avatar_url: raw.user?.avatar_url ?? null,
      streak: raw.user?.streak ?? raw.user?.current_streak ?? 0,
    },
    created_at: raw.created_at ?? new Date().toISOString(),
    description: raw.description ?? '',
    location_name: raw.location_name ?? raw.location?.name ?? null,
    photo_url: raw.photo_url ?? null,
    link_url: raw.link_url ?? null,
    like_count: raw.like_count ?? 0,
    comment_count: raw.comment_count ?? 0,
    user_liked: raw.user_liked ?? false,
    workout: raw.workout
      ? {
          id: raw.workout.id ?? 0,
          exercise_count: raw.workout.exercise_count ?? 0,
          total_sets: raw.workout.total_sets ?? 0,
          duration_minutes: raw.workout.duration ?? raw.workout.duration_minutes ?? 0,
          exercises: raw.workout.exercises ?? [],
        }
      : null,
    personal_record: raw.personal_record ?? null,
    poll: raw.poll
      ? {
          id: raw.poll.id ?? 0,
          question: raw.poll.question ?? '',
          options: raw.poll.options ?? [],
          total_votes: raw.poll.total_votes ?? 0,
          user_vote_id: raw.poll.user_voted ?? raw.poll.user_vote_id ?? null,
          is_active: raw.poll.is_active ?? false,
          ends_at: raw.poll.ends_at ?? new Date(Date.now() + 86400000).toISOString(),
        }
      : null,
    workout_type: raw.workout_type ?? undefined,
    visibility: raw.visibility ?? 'main',
  };
}

export async function fetchFeed(
  tab: 'main' | 'friends',
  cursor?: string,
): Promise<{ items: FeedItem[]; nextCursor: string }> {
  const params: Record<string, string> = { tab };
  if (cursor) params.cursor = cursor;

  const response = await apiClient.get(ENDPOINTS.feed, { params });
  // Backend returns { items: [...], next_cursor: "..." } for AJAX requests
  const raw: any[] = Array.isArray(response.data)
    ? response.data
    : (response.data?.items ?? []);
  return {
    items: raw.map(adaptFeedItem),
    nextCursor: response.data?.next_cursor ?? '',
  };
}

export async function fetchUserPosts(
  username: string,
  cursor?: string,
): Promise<{ items: FeedItem[]; nextCursor: string }> {
  const params: Record<string, string> = { limit: '9' };
  if (cursor) params.cursor = cursor;
  const response = await apiClient.get(ENDPOINTS.userPosts(username), { params });
  const raw: any[] = Array.isArray(response.data)
    ? response.data
    : (response.data?.items ?? []);
  return {
    items: raw.map(adaptFeedItem),
    nextCursor: response.data?.next_cursor ?? '',
  };
}

export async function searchFeed(q: string): Promise<FeedItem[]> {
  const response = await apiClient.get(ENDPOINTS.searchFeed, { params: { q } });
  const raw: any[] = response.data?.posts ?? [];
  return raw.map(adaptFeedItem);
}

export async function toggleLike(
  itemId: string,
  itemType: 'post' | 'checkin',
): Promise<{ liked: boolean; like_count: number }> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.likePost(itemId)
      : ENDPOINTS.likeCheckin(itemId);
  const response = await apiClient.post(endpoint);
  return response.data;
}

export async function deletePost(id: string): Promise<void> {
  await apiClient.post(ENDPOINTS.deletePost(id));
}

export async function deleteCheckin(id: string): Promise<void> {
  await apiClient.post(ENDPOINTS.deleteCheckin(id));
}
