import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteWorkout } from '../api/workouts';

const STORAGE_KEY = 'spottr_active_workout';
const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredWorkout {
  workoutId: string;
  backgroundedAt?: number;
}

interface CheckinMedia {
  uri: string;
  type: 'photo' | 'video';
}

interface ActiveWorkoutContextType {
  workoutId: string | null;
  startedAt: number | null;
  fromCheckin: boolean;
  checkinMedia: CheckinMedia | null;
  showBanner: boolean;
  staleWorkoutCleared: boolean;
  beginWorkout: (id: string, startedAt: number, fromCheckin: boolean, checkinMedia?: CheckinMedia) => void;
  endWorkout: () => void;
  setIsOnScreen: (v: boolean) => void;
  clearStaleNotice: () => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  workoutId: null,
  startedAt: null,
  fromCheckin: false,
  checkinMedia: null,
  showBanner: false,
  staleWorkoutCleared: false,
  beginWorkout: () => {},
  endWorkout: () => {},
  setIsOnScreen: () => {},
  clearStaleNotice: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fromCheckin, setFromCheckin] = useState(false);
  const [checkinMedia, setCheckinMedia] = useState<CheckinMedia | null>(null);
  const [isOnScreen, setIsOnScreenState] = useState(false);
  const [staleWorkoutCleared, setStaleWorkoutCleared] = useState(false);

  // Stable ref so AppState handler always has the current workoutId without re-subscribing
  const workoutIdRef = useRef<string | null>(null);
  useEffect(() => { workoutIdRef.current = workoutId; }, [workoutId]);

  const autoExpire = useCallback(async (storedId: string) => {
    await deleteWorkout(storedId).catch(() => {});
    await AsyncStorage.removeItem(STORAGE_KEY);
    setWorkoutId(null);
    setStartedAt(null);
    setFromCheckin(false);
    setCheckinMedia(null);
    setIsOnScreenState(false);
    workoutIdRef.current = null;
    setStaleWorkoutCleared(true);
  }, []);

  // On mount: check if app was killed while a workout was backgrounded
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const stored: StoredWorkout = JSON.parse(raw);
        if (stored.backgroundedAt && Date.now() - stored.backgroundedAt > STALE_MS) {
          autoExpire(stored.workoutId);
        }
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track background/foreground transitions
  useEffect(() => {
    const handleAppState = async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        if (workoutIdRef.current) {
          const stored: StoredWorkout = {
            workoutId: workoutIdRef.current,
            backgroundedAt: Date.now(),
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        }
      } else if (state === 'active') {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
          const stored: StoredWorkout = JSON.parse(raw);
          if (stored.backgroundedAt && Date.now() - stored.backgroundedAt > STALE_MS) {
            autoExpire(stored.workoutId);
          }
        } catch {}
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [autoExpire]);

  const beginWorkout = useCallback((id: string, ts: number, checkin: boolean, media?: CheckinMedia) => {
    setWorkoutId(id);
    setStartedAt(ts);
    setFromCheckin(checkin);
    if (media) setCheckinMedia(media);
    workoutIdRef.current = id;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ workoutId: id }));
  }, []);

  const endWorkout = useCallback(() => {
    setWorkoutId(null);
    setStartedAt(null);
    setFromCheckin(false);
    setCheckinMedia(null);
    setIsOnScreenState(false);
    workoutIdRef.current = null;
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const setIsOnScreen = useCallback((v: boolean) => {
    setIsOnScreenState(v);
  }, []);

  const clearStaleNotice = useCallback(() => {
    setStaleWorkoutCleared(false);
  }, []);

  const showBanner = workoutId !== null && !isOnScreen;

  return (
    <ActiveWorkoutContext.Provider
      value={{
        workoutId, startedAt, fromCheckin, checkinMedia,
        showBanner, staleWorkoutCleared,
        beginWorkout, endWorkout, setIsOnScreen, clearStaleNotice,
      }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
