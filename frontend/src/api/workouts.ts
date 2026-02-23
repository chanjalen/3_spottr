import { apiClient } from './client';
import { Workout, WorkoutExercise, ExerciseCatalogItem, WorkoutTemplate, StreakDetails, CalendarPost, RecentWorkout } from '../types/workout';

export async function startWorkout(): Promise<Workout> {
  const res = await apiClient.post('/workouts/start/');
  return res.data;
}

export async function fetchActiveWorkout(): Promise<Workout | null> {
  try {
    const res = await apiClient.get('/workouts/api/active/');
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchWorkout(workoutId: string): Promise<Workout> {
  const res = await apiClient.get(`/workouts/${workoutId}/`);
  return res.data;
}

export async function finishWorkout(
  workoutId: string,
  data: {
    notes?: string;
    save_as_template?: boolean;
    template_name?: string;
    visibility?: 'public' | 'friends';
  },
): Promise<{ new_prs: Array<{ exercise_name: string; value: number; unit: string }> }> {
  const res = await apiClient.post(`/workouts/${workoutId}/finish/`, data);
  return res.data;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await apiClient.post(`/workouts/${workoutId}/delete/`);
}

export async function addExercise(workoutId: string, exerciseName: string): Promise<WorkoutExercise> {
  const res = await apiClient.post(`/workouts/${workoutId}/add-exercise/`, { exercise_name: exerciseName });
  return res.data;
}

export async function addCustomExercise(workoutId: string, name: string, category: string): Promise<WorkoutExercise> {
  const res = await apiClient.post(`/workouts/${workoutId}/add-custom-exercise/`, { name, category });
  return res.data;
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  await apiClient.post(`/workouts/exercise/${exerciseId}/delete/`);
}

export async function addSet(exerciseId: string): Promise<{ id: string; reps: null; weight: null; completed: false; order: number }> {
  const res = await apiClient.post(`/workouts/exercise/${exerciseId}/add-set/`);
  return res.data;
}

export async function updateSet(setId: string, data: { reps?: number; weight?: number; completed?: boolean }): Promise<void> {
  await apiClient.post(`/workouts/set/${setId}/update/`, data);
}

export async function deleteSet(setId: string): Promise<void> {
  await apiClient.post(`/workouts/set/${setId}/delete/`);
}

export async function fetchExerciseCatalog(q?: string, category?: string): Promise<ExerciseCatalogItem[]> {
  const res = await apiClient.get('/workouts/api/catalog/', { params: { q, category } });
  return res.data;
}

export async function fetchTemplates(): Promise<WorkoutTemplate[]> {
  const res = await apiClient.get('/workouts/api/templates/');
  return res.data;
}

export async function startFromTemplate(templateId: string): Promise<Workout> {
  const res = await apiClient.post(`/workouts/templates/${templateId}/start/`);
  return res.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await apiClient.post(`/workouts/templates/${templateId}/delete/`);
}

export async function fetchStreakInfo(): Promise<StreakDetails> {
  const res = await apiClient.get('/workouts/api/streak/');
  return res.data;
}

export async function updateWorkoutGoal(goal: number): Promise<void> {
  await apiClient.post('/workouts/api/update-workout-goal/', { goal });
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
