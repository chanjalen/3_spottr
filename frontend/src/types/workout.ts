export interface ExerciseSet {
  id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  category: string;
  order: number;
  sets: ExerciseSet[];
}

export interface Workout {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  duration: number | null; // seconds, null while active
  notes: string;
  exercises: WorkoutExercise[];
  exercise_count: number;
  total_sets: number;
  is_active: boolean;
}

export interface RecentWorkout {
  id: string;
  name: string;
  duration: string; // "45m" or "1h 20m"
  duration_seconds: number;
  exercise_count: number;
  total_sets: number;
  started_at: string;
  time_ago: string;
  is_active: boolean;
}

export interface WorkoutLogStats {
  workouts_count: number;
  total_time: string; // "2h 30m"
  total_time_seconds: number;
  total_sets: number;
  recent_workouts: RecentWorkout[];
}

export interface ExerciseCatalogItem {
  id: string;
  name: string;
  category: string;
  muscle_group: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description?: string;
  exercise_count: number;
  exercises: Array<{ name: string; sets: number; reps?: number }>;
  created_at: string;
}

export interface StreakWeekDay {
  label: 'S' | 'M' | 'T' | 'W' | 'Th' | 'F';
  active: boolean;
  rest: boolean;
  is_today: boolean;
  is_future: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned: boolean;
  user_pct: number; // % of all users who have earned this (0–100)
}

export interface StreakDetails {
  current_streak: number;
  longest_streak: number;
  has_activity_today: boolean;
  has_rest_today: boolean;
  rest_info: {
    rest_days_used: number;
    rest_days_allowed: number;
    rest_days_remaining: number;
  };
  weekly_workout_count: number;
  weekly_workout_goal: number;
  week_days: StreakWeekDay[];
  achievements?: Achievement[];
}

export interface CalendarPost {
  id: string;
  type: 'workout' | 'checkin' | 'post' | 'rest';
  date: string; // "YYYY-M-D" no leading zeros
  description: string;
  photo_url: string | null;
  video_url: string | null;
  location_name: string;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  workout_name: string | null;
  workout_exercises: number | null;
  workout_sets: number | null;
  emoji: string | null;
}

// Legacy alias kept for any remaining references
export type StreakInfo = StreakDetails;

export interface NewPR {
  exercise_name: string;
  value: string;
  unit: string;
  pr_value?: string;
  pr_unit?: string;
}
