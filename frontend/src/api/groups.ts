import { apiClient } from './client';

export interface GroupStreakMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_streak: number;
  has_activity_today: boolean;
}

export interface GroupStreakDetail {
  group_streak: number;
  longest_group_streak: number;
  members: GroupStreakMember[];
}

export interface GroupMember {
  id: string;
  user: string;
  username: string;
  display_name: string;
  role: 'creator' | 'admin' | 'member';
  joined_at: string;
  avatar_url: string | null;
  current_streak: number;
}

export interface GroupDetail {
  id: string;
  created_by: string;
  name: string;
  description: string;
  avatar_url: string | null;
  privacy: 'public' | 'private';
  group_streak: number;
  longest_group_streak: number;
  member_count: number;
  is_member: boolean;
  user_role: 'creator' | 'admin' | 'member' | null;
  invite_code: string | null;
  members: GroupMember[];
  created_at: string;
  updated_at: string;
}

export interface GroupListItem {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  privacy: 'public' | 'private';
  group_streak: number;
  longest_group_streak: number;
  member_count: number;
  is_member: boolean;
  has_pending_request: boolean;
  created_at: string;
}

export async function searchGroups(query?: string): Promise<GroupListItem[]> {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  const { data } = await apiClient.get('/api/groups/', { params });
  return data;
}

export async function createGroup(payload: {
  name: string;
  description?: string;
  avatarUri?: string;
  member_ids?: string[];
}): Promise<GroupDetail> {
  const { avatarUri, member_ids, ...fields } = payload;

  if (avatarUri) {
    const form = new FormData();
    form.append('name', fields.name);
    if (fields.description) form.append('description', fields.description);
    form.append('privacy', 'private');
    if (member_ids?.length) {
      member_ids.forEach(id => form.append('member_ids', id));
    }
    const filename = avatarUri.split('/').pop() ?? 'avatar.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    form.append('avatar', { uri: avatarUri, type: mime, name: filename } as any);
    const { data } = await apiClient.post('/api/groups/create/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  const { data } = await apiClient.post('/api/groups/create/', {
    ...fields,
    privacy: 'private',
    member_ids: member_ids ?? [],
  });
  return data;
}

export async function joinViaCode(code: string): Promise<void> {
  await apiClient.post('/api/groups/join-via-code/', { code });
}

export async function promoteMember(groupId: string, userId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/members/${userId}/promote/`);
}

export async function demoteMember(groupId: string, userId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/members/${userId}/demote/`);
}

export async function kickMember(groupId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/groups/${groupId}/members/${userId}/remove/`);
}

export async function addMember(groupId: string, userId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/members/${userId}/add/`);
}

export async function generateInviteCode(groupId: string): Promise<{ code: string }> {
  const { data } = await apiClient.post(`/api/groups/${groupId}/invite-codes/`);
  return data;
}

export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const { data } = await apiClient.get(`/api/groups/${groupId}/`);
  return data;
}

export async function fetchGroupStreakDetail(groupId: string): Promise<GroupStreakDetail> {
  const { data } = await apiClient.get(`/api/groups/${groupId}/streak/`);
  return data;
}

export async function leaveGroup(groupId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/leave/`);
}

export async function joinGroup(groupId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join/`);
}

export async function requestJoinGroup(groupId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join-requests/create/`, { message: '' });
}

export async function acceptJoinRequest(groupId: string, requestId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join-requests/${requestId}/accept/`);
}

export async function denyJoinRequest(groupId: string, requestId: string): Promise<void> {
  await apiClient.post(`/api/groups/${groupId}/join-requests/${requestId}/deny/`);
}

export async function updateGroup(
  groupId: string,
  payload: {
    name?: string;
    description?: string;
    privacy?: 'public' | 'private';
    avatarUri?: string;
  },
): Promise<GroupDetail> {
  const { avatarUri, ...fields } = payload;

  if (avatarUri) {
    const form = new FormData();
    if (fields.name) form.append('name', fields.name);
    if (fields.description !== undefined) form.append('description', fields.description);
    if (fields.privacy) form.append('privacy', fields.privacy);
    const filename = avatarUri.split('/').pop() ?? 'avatar.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    form.append('avatar', { uri: avatarUri, type: mime, name: filename } as any);
    const { data } = await apiClient.patch(`/api/groups/${groupId}/update/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  const { data } = await apiClient.patch(`/api/groups/${groupId}/update/`, fields);
  return data;
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/api/groups/${groupId}/delete/`);
}
