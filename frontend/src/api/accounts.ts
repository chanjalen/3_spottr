import axios from 'axios';
import { apiClient, API_BASE_URL } from './client';
import { UserBrief, UserProfile, UserSearchResult, SuggestedUser, PersonalRecord } from '../types/user';

export async function apiLogin(username: string, password: string): Promise<{ token: string; user: UserBrief }> {
  const res = await apiClient.post('/accounts/api/login/', { username, password });
  return res.data;
}

export async function apiUpdateProfile(data: { display_name?: string; bio?: string; timezone?: string }): Promise<UserBrief> {
  const res = await apiClient.patch('/accounts/api/me/profile/', data);
  return res.data;
}

export async function apiUpdatePreferences(data: { weight_unit?: 'lbs' | 'kg'; distance_unit?: 'miles' | 'km' }): Promise<UserBrief> {
  const res = await apiClient.patch('/accounts/api/me/preferences/', data);
  return res.data;
}

export async function apiUpdatePrivacy(data: {
  checkin_visible_friends?: boolean;
  checkin_visible_following?: boolean;
  checkin_visible_orgs?: boolean;
  checkin_visible_gyms?: boolean;
}): Promise<void> {
  await apiClient.patch('/accounts/api/me/privacy/', data);
}

export async function apiUpdateNotifications(data: {
  push_notifications?: boolean;
}): Promise<UserBrief> {
  const res = await apiClient.patch('/accounts/api/me/notifications/', data);
  return res.data;
}

export async function apiSignup(data: {
  email: string;
  password: string;
  birthday: string;
}): Promise<{ token: string; user: UserBrief }> {
  const res = await apiClient.post('/accounts/api/signup/', data);
  return res.data;
}

/** Verify email with the provisional token (not yet in SecureStore). */
export async function apiVerifyEmail(
  code: string,
  provisionalToken: string,
): Promise<{ user: UserBrief }> {
  const res = await axios.post(
    `${API_BASE_URL}/accounts/api/verify-email/`,
    { code },
    { headers: { Authorization: `Token ${provisionalToken}`, 'Content-Type': 'application/json' } },
  );
  return res.data;
}

/** Resend verification email using the provisional token. */
export async function apiResendVerification(provisionalToken: string): Promise<void> {
  await axios.post(
    `${API_BASE_URL}/accounts/api/resend-verification/`,
    {},
    { headers: { Authorization: `Token ${provisionalToken}`, 'Content-Type': 'application/json' } },
  );
}

export async function apiCheckUsernameAvailable(
  username: string,
): Promise<{ available: boolean; username: string; error?: string }> {
  const res = await apiClient.get('/accounts/api/username-available/', { params: { username } });
  return res.data;
}

export async function apiUpdateOnboarding(data: {
  display_name?: string;
  username?: string;
  phone_number?: string;
  skip_phone?: boolean;
  workout_frequency?: number;
}): Promise<{ user: UserBrief }> {
  const res = await apiClient.patch('/accounts/api/onboarding/', data);
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

export async function fetchSuggestedUsers(limit = 20): Promise<SuggestedUser[]> {
  const res = await apiClient.get('/accounts/api/suggested-users/', { params: { limit } });
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

export async function fetchMutualFollowers(username: string): Promise<UserBrief[]> {
  const res = await apiClient.get(`/accounts/api/user/${username}/mutual-followers/`);
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
  prId?: string;
}): Promise<PersonalRecord> {
  if (data.videoUri) {
    const formData = new FormData();
    formData.append('exercise_name', data.exercise_name);
    formData.append('value', String(data.value));
    formData.append('unit', data.unit);
    if (data.prId) formData.append('pr_id', data.prId);
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
    ...(data.prId ? { pr_id: data.prId } : {}),
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
  const res = await apiClient.patch('/accounts/api/me/profile/', data);
  return res.data;
}

export async function apiBlockToggle(username: string): Promise<{ blocked: boolean }> {
  const res = await apiClient.post('/accounts/api/block-toggle/', { username });
  return res.data;
}

export async function apiRemoveFollower(username: string): Promise<void> {
  await apiClient.post('/accounts/api/follow-toggle/', { username, action: 'remove_follower' });
}

export async function apiDeleteAccount(): Promise<void> {
  await apiClient.delete('/accounts/api/me/delete/');
}

/** Authenticate (or create) a Spottr account using a Google ID token. */
export async function apiGoogleAuth(idToken: string): Promise<{ token: string; user: UserBrief }> {
  const res = await apiClient.post('/accounts/api/google-auth/', { id_token: idToken });
  return res.data;
}

/** Request a password reset code for the given email address. */
export async function apiPasswordResetRequest(email: string): Promise<void> {
  await apiClient.post('/accounts/api/password-reset/request/', { email });
}

/** Confirm a password reset using the 6-digit code. */
export async function apiPasswordResetConfirm(data: {
  email: string;
  code: string;
  new_password: string;
}): Promise<void> {
  await apiClient.post('/accounts/api/password-reset/confirm/', data);
}
