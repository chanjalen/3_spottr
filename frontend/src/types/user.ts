export interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  streak?: number;
  is_following?: boolean;
  email?: string;
  phone_number?: string | null;
  birthday?: string | null;
  workout_frequency?: number;
  is_email_verified?: boolean;
  onboarding_step?: number;
}

export interface UserProfile extends UserBrief {
  bio: string;
  longest_streak: number;
  total_workouts: number;
  is_following: boolean;
  is_followed_by: boolean;
  follower_count: number;
  following_count: number;
  friend_count?: number;
  member_since: string;
  has_checkin_today?: boolean;
}

export interface UserSearchResult extends UserBrief {
  is_following: boolean;
}

export interface SuggestedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_following: boolean;
  mutual_count: number;
  mutual_previews: Array<{ id: string; username: string; avatar_url: string | null }>;
}

export interface PersonalRecord {
  id: string;
  exercise_name: string;
  value: number;
  unit: string;
  video_url?: string | null;
  created_at: string;
}
