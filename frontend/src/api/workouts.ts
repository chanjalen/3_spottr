import { apiClient } from './client';
import {
  Workout,
  WorkoutExercise,
  ExerciseCatalogItem,
  WorkoutTemplate,
  StreakInfo,
  WorkoutLogStats,
  CalendarPost,
  RecentWorkout,
} from '../types/workout';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function adaptExercise(raw: any): WorkoutExercise {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    category: raw.category ?? '',
    order: raw.order ?? 0,
    sets: (raw.sets ?? []).map((s: any) => ({
      id: String(s.id),
      set_number: s.set_number ?? 0,
      reps: s.reps ?? null,
      weight: s.weight != null ? Number(s.weight) : null,
      completed: s.completed ?? false,
    })),
  };
}

function adaptWorkout(raw: any): Workout {
  return {
    id: String(raw.id ?? raw.workout_id ?? ''),
    name: raw.name ?? 'Workout',
    started_at: raw.started_at ?? new Date().toISOString(),
    finished_at: raw.finished_at ?? null,
    duration: raw.duration ?? null,
    notes: raw.notes ?? '',
    exercises: (raw.exercises ?? []).map(adaptExercise),
    exercise_count: raw.exercise_count ?? 0,
    total_sets: raw.total_sets ?? 0,
    is_active: raw.is_active ?? true,
  };
}

// ─── Log page stats ────────────────────────────────────────────────────────────

export async function fetchLogStats(): Promise<WorkoutLogStats> {
  const res = await apiClient.get('/workouts/api/log/');
  return res.data;
}

// ─── Active workout detection ─────────────────────────────────────────────────

export async function fetchActiveWorkout(): Promise<Workout | null> {
  const res = await apiClient.get('/workouts/api/active/');
  const raw = res.data?.active;
  return raw ? adaptWorkout(raw) : null;
}

// ─── Workout CRUD ─────────────────────────────────────────────────────────────

export async function startWorkout(): Promise<Workout> {
  const res = await apiClient.post('/workouts/start/');
  // Backend returns { success, workout_id } — fetch full workout object
  const workoutId = res.data.workout_id;
  return fetchWorkout(workoutId);
}

export async function fetchWorkout(workoutId: string): Promise<Workout> {
  const res = await apiClient.get(`/workouts/${workoutId}/`);
  return adaptWorkout(res.data);
}

export async function finishWorkout(
  workoutId: string,
  data: {
    name?: string;
    notes?: string;
    save_template?: boolean;
    template_name?: string;
    post_to_feed?: boolean;
    visibility?: 'main' | 'friends';
    pr_data?: Array<{ exercise_name: string; value: string; unit: string }>;
  },
): Promise<{ workout: { id: string; name: string; duration_seconds: number; exercise_count: number; total_sets: number } }> {
  const payload: Record<string, any> = {
    notes: data.notes ?? '',
    name: data.name ?? '',
    save_template: data.save_template ?? false,
    template_name: data.template_name ?? '',
    post_to_feed: data.post_to_feed ?? true,
    visibility: data.visibility ?? 'main',
  };
  if (data.pr_data?.length) {
    payload.pr_data = data.pr_data;
  }
  const res = await apiClient.post(`/workouts/${workoutId}/finish/`, payload);
  return res.data;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiClient.post(`/workouts/${workoutId}/delete/`);
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function addExercise(workoutId: string, catalogId: string): Promise<WorkoutExercise> {
  const res = await apiClient.post(`/workouts/${workoutId}/add-exercise/`, { catalog_id: catalogId });
  return adaptExercise(res.data.exercise);
}

export async function addCustomExercise(workoutId: string, name: string): Promise<WorkoutExercise> {
  const res = await apiClient.post(`/workouts/${workoutId}/add-custom-exercise/`, { name });
  return adaptExercise(res.data.exercise);
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  await apiClient.post(`/workouts/exercise/${exerciseId}/delete/`);
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export async function addSet(
  exerciseId: string,
): Promise<{ id: string; set_number: number; reps: number; weight: number; completed: boolean }> {
  const res = await apiClient.post(`/workouts/exercise/${exerciseId}/add-set/`);
  const s = res.data.set;
  return {
    id: String(s.id),
    set_number: s.set_number,
    reps: s.reps ?? 0,
    weight: s.weight != null ? Number(s.weight) : 0,
    completed: s.completed ?? false,
  };
}

export async function updateSet(
  setId: string,
  data: { reps?: number | null; weight?: number | null; completed?: boolean },
): Promise<{ is_new_pr?: boolean; pr_exercise?: string; pr_value?: string; pr_unit?: string }> {
  const res = await apiClient.post(`/workouts/set/${setId}/update/`, data);
  return res.data;
}

export async function deleteSet(setId: string): Promise<void> {
  await apiClient.post(`/workouts/set/${setId}/delete/`);
}

// ─── Exercise catalog ─────────────────────────────────────────────────────────

export async function fetchExerciseCatalog(q?: string, category?: string): Promise<ExerciseCatalogItem[]> {
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (category && category.toLowerCase() !== 'all') params.category = category;
  const res = await apiClient.get('/workouts/api/catalog/', { params });
  return res.data;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function fetchTemplates(): Promise<WorkoutTemplate[]> {
  const res = await apiClient.get('/workouts/api/templates/');
  return res.data?.templates ?? res.data ?? [];
}

export async function startFromTemplate(templateId: string): Promise<Workout> {
  const res = await apiClient.post(`/workouts/templates/${templateId}/start/`);
  const workoutId = res.data.workout_id;
  return fetchWorkout(workoutId);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await apiClient.post(`/workouts/templates/${templateId}/delete/`);
}

export async function saveWorkoutAsTemplate(workoutId: string): Promise<{ template_id: string; template_name: string }> {
  const res = await apiClient.post(`/workouts/${workoutId}/add-to-templates/`);
  return res.data;
}

// ─── Streak ───────────────────────────────────────────────────────────────────

export async function fetchStreakInfo(): Promise<StreakInfo> {
  const res = await apiClient.get('/workouts/api/streak/');
  return res.data;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export async function updateWorkoutGoal(goal: number): Promise<void> {
  await apiClient.post('/workouts/api/update-workout-goal/', { weekly_workout_goal: goal });
}

export async function takeRestDay(): Promise<{ success: boolean; protected?: boolean; message?: string; error?: string }> {
  const res = await apiClient.post('/workouts/rest-day/');
  return res.data;
}

export async function fetchRecentWorkouts(): Promise<RecentWorkout[]> {
  const res = await apiClient.get('/workouts/api/recent/');
  return res.data;
}

export async function fetchCalendarPosts(
  year: number,
  month: number,
  username?: string,
): Promise<{ success: boolean; posts: CalendarPost[] }> {
  const params: Record<string, any> = { year, month };
  if (username) params.username = username;
  const res = await apiClient.get('/workouts/api/calendar/', { params });
  return res.data;
}
