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

export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  const { data } = await apiClient.get(`/groups/${groupId}/`);
  return data;
}

export async function fetchGroupStreakDetail(groupId: string): Promise<GroupStreakDetail> {
  const { data } = await apiClient.get(`/groups/${groupId}/streak/`);
  return data;
}
