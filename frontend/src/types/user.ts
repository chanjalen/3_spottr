export interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  streak?: number;
}

export interface UserProfile extends UserBrief {
  bio: string;
  longest_streak: number;
  total_workouts: number;
  is_following: boolean;
  follower_count: number;
  following_count: number;
  friend_count?: number;
  member_since: string;
}

export interface UserSearchResult extends UserBrief {
  is_following: boolean;
}

export interface PersonalRecord {
  id: string;
  exercise_name: string;
  value: number;
  unit: string;
  video_url?: string | null;
  created_at: string;
}
