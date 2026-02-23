import { apiClient } from './client';

export interface LeaderboardUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_streak: number;
  total_workouts: number;
}

export interface LeaderboardEntry {
  rank: number;
  user: LeaderboardUser;
}

export interface LeaderboardResponse {
  tab: 'friends' | 'gym';
  gym_id: string | null;
  gym_name: string | null;
  enrolled_gyms: Array<{ id: string; name: string }>;
  leaderboard: LeaderboardEntry[];
  my_rank: number | null;
}

export async function fetchLeaderboard(
  tab: 'friends' | 'gym',
  gymId?: string,
): Promise<LeaderboardResponse> {
  const params: Record<string, string> = { tab };
  if (gymId) params.gym_id = gymId;
  const res = await apiClient.get('/api/social/leaderboard/', { params });
  return res.data;
}
