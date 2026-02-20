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

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  weekly_goal: number;
  workouts_this_week: number;
  rest_days_used: number;
  week_days: Array<{
    date: string;
    status: 'workout' | 'rest' | 'pending';
  }>;
}

export interface NewPR {
  exercise_name: string;
  value: number;
  unit: string;
  previous_value: number | null;
}
