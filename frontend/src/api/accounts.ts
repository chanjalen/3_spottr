import { apiClient } from './client';
import { UserBrief, UserProfile, UserSearchResult, PersonalRecord } from '../types/user';

export async function apiLogin(username: string, password: string): Promise<{ token: string; user: UserBrief }> {
  const res = await apiClient.post('/accounts/api/login/', { username, password });
  return res.data;
}

export async function apiSignup(data: {
  username: string;
  email: string;
  display_name: string;
  phone_number: string;
  birthday: string;
  password: string;
  password_confirm: string;
}): Promise<{ token: string; user: UserBrief }> {
  const res = await apiClient.post('/accounts/api/signup/', data);
  return res.data;
}

export async function fetchMe(): Promise<UserBrief> {
  const res = await apiClient.get('/accounts/api/me/');
  return res.data;
}

export async function fetchProfile(username: string): Promise<UserProfile> {
  const res = await apiClient.get(`/accounts/api/profile/${username}/`);
  return res.data;
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const res = await apiClient.get('/accounts/api/search-users/', { params: { q } });
  return res.data?.results ?? [];
}

export async function toggleFollow(targetUsername: string): Promise<{ following: boolean }> {
  const res = await apiClient.post('/accounts/api/follow-toggle/', { username: targetUsername });
  return res.data;
}

export async function followBack(userId: string): Promise<{ action: string }> {
  const res = await apiClient.post('/accounts/api/follow-toggle/', { user_id: userId });
  return res.data;
}

export async function fetchFollowers(username?: string): Promise<UserBrief[]> {
  const res = await apiClient.get('/accounts/api/followers/', { params: username ? { username } : undefined });
  return res.data?.results ?? [];
}

export async function fetchFollowing(username?: string): Promise<UserBrief[]> {
  const res = await apiClient.get('/accounts/api/following/', { params: username ? { username } : undefined });
  return res.data?.results ?? [];
}

export async function fetchUserPRs(username: string): Promise<PersonalRecord[]> {
  const res = await apiClient.get(`/accounts/api/user/${username}/prs/`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchFriends(username?: string): Promise<UserBrief[]> {
  const [followers, following] = await Promise.all([
    fetchFollowers(username),
    fetchFollowing(username),
  ]);
  const followerIds = new Set(followers.map((u) => u.id));
  return following.filter((u) => followerIds.has(u.id));
}

export async function savePR(data: {
  exercise_name: string;
  value: number;
  unit: string;
  videoUri?: string;
}): Promise<PersonalRecord> {
  if (data.videoUri) {
    const formData = new FormData();
    formData.append('exercise_name', data.exercise_name);
    formData.append('value', String(data.value));
    formData.append('unit', data.unit);
    const filename = data.videoUri.split('/').pop() ?? 'video.mp4';
    const fileType = filename.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
    formData.append('video', { uri: data.videoUri, name: filename, type: fileType } as any);
    const res = await apiClient.post('/accounts/api/pr/save/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }
  const res = await apiClient.post('/accounts/api/pr/save/', {
    exercise_name: data.exercise_name,
    value: data.value,
    unit: data.unit,
  });
  return res.data;
}

export async function deletePR(prId: string): Promise<void> {
  await apiClient.post('/accounts/api/pr/delete/', { pr_id: prId });
}

export async function updateUserAvatar(uri: string): Promise<UserBrief> {
  const form = new FormData();
  const filename = uri.split('/').pop() ?? 'avatar.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  form.append('avatar', { uri, type: mime, name: filename } as any);
  const res = await apiClient.patch('/accounts/api/me/avatar/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function updateUserProfile(data: {
  display_name?: string;
  bio?: string;
}): Promise<UserBrief> {
  const res = await apiClient.patch('/accounts/api/me/', data);
  return res.data;
}
