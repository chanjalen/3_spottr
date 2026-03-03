import { UserBrief } from './user';

export type FeedItemType = 'post' | 'checkin';

// Exercise summary shown on feed cards (name + set count only)
export interface ExerciseSummary {
  name: string;
  sets: number;
}

// Workout card shown inline on feed cards
export interface WorkoutSummary {
  id: string;
  name: string;
  exercise_count: number;
  total_sets: number;
  duration: string;  // formatted: "1h 30m" or "45m"
  exercises: ExerciseSummary[];
}

// Full workout detail (fetched separately when user taps a workout card)
export interface SetDetail {
  set_number: number;
  reps: number;
  weight: number;
  completed: boolean;
}

export interface ExerciseDetail {
  id: string;
  name: string;
  category: string;
  order: number;
  unit: string;
  sets: SetDetail[];
}

export interface WorkoutDetail {
  id: string;
  name: string;
  duration: string;
  exercises: ExerciseDetail[];
}

export interface PersonalRecord {
  id: number;
  exercise_name: string;
  value: number;
  unit: string;
}

export interface PollOption {
  id: number;
  text: string;
  votes: number;
  order: number;
}

export interface Poll {
  id: number;
  question: string;
  options: PollOption[];
  total_votes: number;
  user_vote_id: number | null;
  is_active: boolean;
  ends_at: string;
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  user: UserBrief;
  created_at: string;
  description: string;
  location_name: string | null;
  photo_url: string | null;
  video_url?: string | null;
  link_url: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  workout: WorkoutSummary | null;
  personal_record: PersonalRecord | null;
  poll: Poll | null;
  workout_type?: string;
  visibility: 'main' | 'friends';
  /** Names of shared gyms or orgs shown as tags on gym/org feed tabs */
  shared_context?: string[];
}

export interface Comment {
  id: string;
  user: UserBrief;
  description: string;
  photo_url?: string | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  reply_count: number;
  replies?: Comment[];
}
