import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { FeedItem, WorkoutDetail } from '../types/feed';

/** Normalize a raw backend feed item to the frontend FeedItem shape. */
function adaptFeedItem(raw: any): FeedItem {
  if (raw.type === 'checkin') {
    console.log('[Feed] checkin', raw.id, 'front_camera_url:', raw.front_camera_url ?? 'MISSING');
  }
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
    photo_urls: Array.isArray(raw.photo_urls)
      ? raw.photo_urls
      : raw.photo_url
        ? [raw.photo_url]
        : [],
    video_url: raw.video_url ?? null,
    media_items: Array.isArray(raw.media_items)
      ? raw.media_items.map((m: any) => ({ url: m.url ?? '', kind: m.kind === 'video' ? 'video' : 'photo' }))
      : [],
    is_front_camera: raw.is_front_camera ?? false,
    front_camera_url: raw.front_camera_url ?? null,
    link_url: raw.link_url ?? null,
    like_count: raw.like_count ?? 0,
    comment_count: raw.comment_count ?? 0,
    user_liked: raw.user_liked ?? false,
    workout: raw.workout
      ? {
          id: String(raw.workout.id ?? ''),
          name: raw.workout.name ?? '',
          exercise_count: raw.workout.exercise_count ?? 0,
          total_sets: raw.workout.total_sets ?? 0,
          duration: raw.workout.duration ?? '',
          exercises: raw.workout.exercises ?? [],
        }
      : null,
    personal_record: raw.personal_record ?? null,
    poll: raw.poll
      ? {
          id: raw.poll.id ?? 0,
          question: raw.poll.question ?? '',
          options: (raw.poll.options ?? []).map((opt: any, i: number) => ({
            id: opt.id ?? i,
            text: opt.text ?? opt.option_text ?? opt.label ?? '',
            votes: opt.votes ?? opt.vote_count ?? opt.votes_count ?? 0,
            order: opt.order ?? opt.position ?? i,
          })),
          total_votes: raw.poll.total_votes ?? raw.poll.vote_count ?? 0,
          user_vote_id: raw.poll.user_vote_option ?? raw.poll.user_vote_id ?? raw.poll.voted_option_id ?? null,
          is_active: raw.poll.is_active ?? true,
          ends_at: raw.poll.ends_at ?? raw.poll.expires_at ?? new Date(Date.now() + 86400000).toISOString(),
        }
      : null,
    workout_type: raw.workout_type ?? undefined,
    visibility: raw.visibility ?? 'main',
    shared_context: raw.shared_context?.length ? raw.shared_context : undefined,
  };
}

export async function fetchPostById(
  postId: string,
  itemType?: 'post' | 'workout' | 'checkin',
): Promise<FeedItem> {
  const url = ENDPOINTS.postDetail(postId, itemType === 'checkin' ? 'checkin' : undefined);
  const response = await apiClient.get(url);
  return adaptFeedItem(response.data);
}

export async function fetchFeed(
  tab: 'main' | 'friends' | 'gym' | 'org',
  cursor?: string,
  limit?: number,
): Promise<{ items: FeedItem[]; nextCursor: string }> {
  const params: Record<string, string> = { tab };
  if (cursor) params.cursor = cursor;
  if (limit) params.limit = String(limit);

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

export async function fetchUserPostThumbnails(
  username: string,
  cursor?: string,
): Promise<{ items: FeedItem[]; nextCursor: string }> {
  const params: Record<string, string> = { limit: '9' };
  if (cursor) params.cursor = cursor;
  const response = await apiClient.get(ENDPOINTS.userPostThumbnails(username), { params });
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
  thumbnailOnly?: boolean,
): Promise<{ items: FeedItem[]; nextCursor: string }> {
  const params: Record<string, string> = { limit: '9' };
  if (cursor) params.cursor = cursor;
  if (thumbnailOnly) params.fields = 'thumbnail';
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

export async function createPost(params: {
  text?: string;
  linkUrl?: string;
  visibility?: 'main' | 'friends';
  replyRestriction?: 'everyone' | 'friends' | 'mentions';
  /** Ordered media items — photos and/or videos mixed together */
  media?: Array<{ uri: string; name: string; type: string }>;
  poll?: { question: string; options: string[]; duration: number };
  pr?: { exerciseName: string; value: string; unit: string };
  workoutId?: string;
}): Promise<{ post_id: string }> {
  const formData = new FormData();
  if (params.text) formData.append('text', params.text);
  if (params.linkUrl) formData.append('link_url', params.linkUrl);
  formData.append('visibility', params.visibility ?? 'main');
  formData.append('reply_restriction', params.replyRestriction ?? 'everyone');
  if (params.media) {
    params.media.forEach(m => formData.append('media[]', m as any));
  }
  if (params.workoutId) formData.append('workout_id', params.workoutId);
  if (params.poll) {
    formData.append('poll_question', params.poll.question);
    params.poll.options.forEach(o => formData.append('poll_options[]', o));
    formData.append('poll_duration', String(params.poll.duration));
  }
  if (params.pr) {
    formData.append('pr_exercise_name', params.pr.exerciseName);
    formData.append('pr_value', params.pr.value);
    formData.append('pr_unit', params.pr.unit);
  }
  const response = await apiClient.post(ENDPOINTS.createPost, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

export interface Liker {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export async function fetchLikers(
  itemId: string,
  itemType: 'post' | 'checkin',
): Promise<Liker[]> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.postLikers(itemId)
      : ENDPOINTS.checkinLikers(itemId);
  const response = await apiClient.get(endpoint);
  return response.data?.likers ?? [];
}

export async function fetchWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const response = await apiClient.get(`/api/workouts/${workoutId}/detail/`);
  return response.data;
}

export interface CheckinItem {
  id: string;
  type: 'checkin';
  description: string;
  location_name: string;
  workout_type: string;
  photo_url: string | null;
  video_url: string | null;
  is_front_camera: boolean;
  created_at: string;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
}

export async function fetchUserCheckins(
  username: string,
  cursor?: string,
  month?: number,
  year?: number,
): Promise<{ items: CheckinItem[]; nextCursor: string }> {
  const params: Record<string, string> = { limit: month && year ? '100' : '20' };
  if (cursor) params.cursor = cursor;
  if (month) params.month = String(month);
  if (year) params.year = String(year);
  const response = await apiClient.get(ENDPOINTS.userCheckins(username), { params });
  const raw: any[] = Array.isArray(response.data)
    ? response.data
    : (response.data?.items ?? []);
  const items: CheckinItem[] = raw.map((r) => ({
    id: String(r.id ?? ''),
    type: 'checkin',
    description: r.description ?? '',
    location_name: r.location_name ?? '',
    workout_type: r.workout_type ?? '',
    photo_url: r.photo_url ?? null,
    video_url: r.video_url ?? null,
    is_front_camera: r.is_front_camera ?? false,
    created_at: r.created_at ?? new Date().toISOString(),
    like_count: r.like_count ?? 0,
    comment_count: r.comment_count ?? 0,
    user_liked: r.user_liked ?? false,
  }));
  return { items, nextCursor: response.data?.next_cursor ?? '' };
}

export async function toggleLikeCheckin(id: string): Promise<{ liked: boolean; like_count: number }> {
  const response = await apiClient.post(ENDPOINTS.likeCheckin(id));
  return { liked: response.data.liked as boolean, like_count: response.data.like_count as number };
}

export async function createCheckin(params: {
  // Exactly one of gymId or locationName is required
  gymId?: string;
  locationName?: string;
  activity: string;
  description?: string;
  // Camera capture always produces a photo or video
  photo?: { uri: string; name: string; type: string };
  video?: { uri: string; name: string; type: string };
  // Multiple segments when camera was flipped during recording — backend stitches
  videoSegments?: Array<{ uri: string; name: string; type: string }>;
  // Optional second camera shot (dual camera mode)
  frontCameraPhoto?: { uri: string; name: string; type: string };
  // Optional: ID of a logged workout to attach to this check-in
  workoutId?: string;
  isFrontCamera?: boolean;
}): Promise<{ checkin_id: string }> {
  const formData = new FormData();
  if (params.gymId) formData.append('gym_id', params.gymId);
  if (params.locationName) formData.append('location_name', params.locationName);
  formData.append('activity', params.activity);
  if (params.description) formData.append('description', params.description);
  if (params.photo) formData.append('photo', params.photo as any);
  if (params.videoSegments && params.videoSegments.length > 1) {
    params.videoSegments.forEach((seg) => formData.append('video_segments[]', seg as any));
  } else if (params.video) {
    formData.append('video', params.video as any);
  }
  if (params.frontCameraPhoto) formData.append('front_camera_photo', params.frontCameraPhoto as any);
  if (params.workoutId) formData.append('workout_id', params.workoutId);
  formData.append('is_front_camera', params.isFrontCamera ? 'true' : 'false');

  console.log('[createCheckin] sending front_camera_photo:', !!params.frontCameraPhoto, params.frontCameraPhoto?.uri ?? 'none');
  // Do NOT set Content-Type manually — React Native's XHR sets it automatically
  // with the correct multipart boundary when the body is FormData.
  const response = await apiClient.post(ENDPOINTS.createCheckin, formData, {
    headers: { 'Content-Type': undefined },
  });
  console.log('[createCheckin] response:', JSON.stringify(response.data));
  return response.data;
}
