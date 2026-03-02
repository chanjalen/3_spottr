import { apiClient } from './client';
import { GymListItem, Gym, BusyLevel, WorkoutInvite, TopLifter, HourlyBusyEntry } from '../types/gym';

export async function fetchGyms(q?: string): Promise<GymListItem[]> {
  const res = await apiClient.get('/api/gyms/gyms/', { params: q ? { q } : undefined });
  return res.data;
}

export async function fetchGymDetail(gymId: string): Promise<Gym> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/`);
  return res.data;
}

export async function enrollGym(gymId: string): Promise<Gym> {
  const res = await apiClient.post(`/api/gyms/gyms/${gymId}/enroll/`);
  return res.data;
}

export async function unenrollGym(gymId: string): Promise<void> {
  await apiClient.post(`/api/gyms/gyms/${gymId}/unenroll/`);
}

export async function fetchBusyLevel(gymId: string): Promise<BusyLevel> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/busy-level/`);
  return res.data;
}

export async function submitBusyLevel(gymId: string, surveyResponse: number): Promise<BusyLevel> {
  const res = await apiClient.post(`/api/gyms/gyms/${gymId}/busy-level/`, { survey_response: surveyResponse });
  return res.data;
}

export async function fetchGymLeaderboard(gymId: string, lift = 'total'): Promise<TopLifter[]> {
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/leaderboard/`, { params: { lift } });
  return res.data;
}

export async function fetchWorkoutInvites(gymId: string): Promise<WorkoutInvite[]> {
  const res = await apiClient.get('/api/gyms/invites/', { params: { gym_id: gymId } });
  return res.data;
}

export async function createWorkoutInvite(payload: {
  gym_id: string;
  workout_type: string;
  description: string;
  spots_available: number;
  scheduled_time: string;
  type: 'gym';
  expires_at: string;
}): Promise<WorkoutInvite> {
  const res = await apiClient.post('/api/gyms/invites/', payload);
  return res.data;
}

export async function cancelWorkoutInvite(inviteId: string): Promise<void> {
  await apiClient.delete(`/api/gyms/invites/${inviteId}/`);
}

export async function createJoinRequest(inviteId: string, description: string): Promise<void> {
  await apiClient.post(`/api/gyms/invites/${inviteId}/join/`, { description });
}

export async function cancelJoinRequest(requestId: string): Promise<void> {
  await apiClient.delete(`/api/gyms/invites/requests/${requestId}/cancel/`);
}

export async function fetchMyGyms(): Promise<Gym[]> {
  const res = await apiClient.get('/api/gyms/me/gym/');
  return res.data;
}

export async function fetchHourlyBusyLevel(gymId: string, date?: string): Promise<HourlyBusyEntry[]> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await apiClient.get(`/api/gyms/gyms/${gymId}/busy-level/hourly/`, {
    params: { ...(date ? { date } : {}), tz },
  });
  return res.data;
}
