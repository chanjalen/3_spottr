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

export async function fetchFollowers(username?: string): Promise<UserBrief[]> {
  const res = await apiClient.get('/accounts/api/followers/', username ? { params: { username } } : undefined);
  return res.data;
}

export async function fetchFollowing(username?: string): Promise<UserBrief[]> {
  const res = await apiClient.get('/accounts/api/following/', username ? { params: { username } } : undefined);
  return res.data;
}

export async function savePR(data: {
  exercise_name: string;
  value: number;
  unit: string;
}): Promise<PersonalRecord> {
  const res = await apiClient.post('/accounts/api/pr/save/', data);
  return res.data;
}

export async function deletePR(prId: string): Promise<void> {
  await apiClient.post('/accounts/api/pr/delete/', { pr_id: prId });
}
