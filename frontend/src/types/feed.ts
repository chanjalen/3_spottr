import { UserBrief } from './user';

export type FeedItemType = 'post' | 'checkin';

export interface Exercise {
  name: string;
  sets: number;
}

export interface WorkoutSummary {
  id: number;
  exercise_count: number;
  total_sets: number;
  duration_minutes: number;
  exercises: Exercise[];
  workout_type?: string;
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
  id: number;
  type: FeedItemType;
  user: UserBrief;
  created_at: string;
  description: string;
  location_name: string | null;
  photo_url: string | null;
  link_url: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  workout: WorkoutSummary | null;
  personal_record: PersonalRecord | null;
  poll: Poll | null;
  workout_type?: string;
  visibility: 'main' | 'friends';
}

export interface Comment {
  id: number;
  user: UserBrief;
  description: string;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  reply_count: number;
  replies?: Comment[];
}
