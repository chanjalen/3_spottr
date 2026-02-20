import { UserBrief } from './user';

export interface Gym {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  is_enrolled: boolean;
}

export interface BusyLevel {
  level: 'quiet' | 'moderate' | 'busy' | 'very_busy' | 'packed';
  label: string;
  percentage: number;
  response_count: number;
  last_updated: string | null;
}

export interface WorkoutInvite {
  id: string;
  creator: UserBrief;
  gym: { id: string; name: string };
  message: string;
  starts_at: string;
  created_at: string;
  request_status: 'pending' | 'accepted' | 'denied' | null;
}

export interface LeaderboardEntry {
  rank: number;
  user: UserBrief;
  streak: number;
  total: number;
}
