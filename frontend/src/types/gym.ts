export interface GymListItem {
  id: string;
  name: string;
  address: string | null;
  latitude: string | null;   // Decimal as string from DRF
  longitude: string | null;
  rating: string | null;
  rating_count: number | null;
  is_enrolled: boolean;
  busy_level: BusyLevel | null;
  top_lifter: TopLifter | null;
}

export interface Gym extends GymListItem {
  website: string | null;
  phone_number: string | null;
  hours: Record<string, string>;
  amenities: string[];
  google_place_id: string | null;
  enrolled_users_count: number;
  created_at: string;
  updated_at: string;
}

export interface BusyLevel {
  level: number | null;    // 1–5 integer or null
  label: string | null;
  total_responses: number;
}

// Matches get_top_lifters output via TopLifterSerializer
export interface TopLifter {
  rank: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  value: number;
  unit: string;
}

export interface WorkoutInvite {
  id: string;
  username: string;           // creator
  gym_name: string;
  description: string;
  workout_type: string;
  scheduled_time: string;
  spots_available: number;
  total_spots: number;
  type: 'gym' | 'group' | 'individual';
  is_expired: boolean;
  expires_at: string;
  created_at: string;
}

// busy level option → survey_response integer (1-indexed)
export type BusyOption = 'quiet' | 'moderate' | 'busy' | 'very_busy' | 'packed';

export interface HourlyBusyEntry {
  hour: number;
  avg_level: number | null;
  rounded_level: number | null;
  label: string | null;
  total_responses: number;
  breakdown: { '1': number; '2': number; '3': number; '4': number; '5': number };
}
