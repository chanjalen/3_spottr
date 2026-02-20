import { apiClient } from './client';
import { Gym, BusyLevel, WorkoutInvite, LeaderboardEntry } from '../types/gym';

export async function fetchGyms(q?: string): Promise<Gym[]> {
  const res = await apiClient.get('/api/gyms/gyms/', { params: q ? { q } : undefined });
  return res.data;
}

export async function fetchGymDetail(gymId: string): Promise<Gym> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/`);
  return res.data;
}

export async function enrollGym(gymId: string): Promise<void> {
  await apiClient.post(`/api/gyms/gyms/${gymId}/enroll/`);
}

export async function unenrollGym(gymId: string): Promise<void> {
  await apiClient.post(`/api/gyms/gyms/${gymId}/unenroll/`);
}

export async function fetchBusyLevel(gymId: string): Promise<BusyLevel> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/busy-level/`);
  return res.data;
}

export async function submitBusyLevel(gymId: string, level: string): Promise<void> {
  await apiClient.post(`/api/gyms/gyms/${gymId}/busy-level/`, { level });
}

export async function fetchGymLeaderboard(gymId: string, category?: string): Promise<LeaderboardEntry[]> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/leaderboard/`, {
    params: category ? { category } : undefined,
  });
  return res.data;
}

export async function fetchWorkoutInvites(gymId: string): Promise<WorkoutInvite[]> {
  const res = await apiClient.get('/api/gyms/invites/', { params: { gym_id: gymId } });
  return res.data;
}

export async function createWorkoutInvite(gymId: string, message: string, startsAt: string): Promise<WorkoutInvite> {
  const res = await apiClient.post('/api/gyms/invites/', { gym_id: gymId, message, starts_at: startsAt });
  return res.data;
}

export async function joinWorkoutInvite(inviteId: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/${inviteId}/join/`);
}

export async function fetchMyGyms(): Promise<Gym[]> {
  const res = await apiClient.get('/api/gyms/me/gym/');
  return res.data;
}
