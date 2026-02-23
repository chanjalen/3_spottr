export interface ExerciseSet {
  id: string;
  reps: number | null;
  weight: number | null;
  completed: boolean;
  order: number;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  category: string;
  sets: ExerciseSet[];
}

export interface Workout {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration: number | null;
  notes: string;
  exercises: WorkoutExercise[];
  exercise_count: number;
  total_sets: number;
  is_active: boolean;
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
  exercise_count: number;
  exercises: Array<{ name: string; sets: number }>;
  created_at: string;
}

export interface StreakWeekDay {
  label: 'S' | 'M' | 'T' | 'W' | 'Th' | 'F';
  active: boolean;
  rest: boolean;
  is_today: boolean;
  is_future: boolean;
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

export interface RecentWorkout {
  id: string;
  name: string;
  type: string;
  started_at: string;
  duration_minutes: number;
  exercise_count: number;
}

export interface NewPR {
  exercise_name: string;
  value: number;
  unit: string;
  previous_value: number | null;
}
