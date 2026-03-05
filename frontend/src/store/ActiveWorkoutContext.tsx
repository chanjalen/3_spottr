import React, { createContext, useCallback, useContext, useState } from 'react';

interface CheckinMedia {
  uri: string;
  type: 'photo' | 'video';
}

interface ActiveWorkoutContextType {
  workoutId: string | null;
  startedAt: number | null; // Unix ms timestamp
  fromCheckin: boolean;
  checkinMedia: CheckinMedia | null;
  showBanner: boolean;      // workoutId !== null && !isOnScreen
  beginWorkout: (id: string, startedAt: number, fromCheckin: boolean, checkinMedia?: CheckinMedia) => void;
  endWorkout: () => void;
  setIsOnScreen: (v: boolean) => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  workoutId: null,
  startedAt: null,
  fromCheckin: false,
  checkinMedia: null,
  showBanner: false,
  beginWorkout: () => {},
  endWorkout: () => {},
  setIsOnScreen: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fromCheckin, setFromCheckin] = useState(false);
  const [checkinMedia, setCheckinMedia] = useState<CheckinMedia | null>(null);
  const [isOnScreen, setIsOnScreenState] = useState(false);

  const beginWorkout = useCallback((id: string, ts: number, checkin: boolean, media?: CheckinMedia) => {
    setWorkoutId(id);
    setStartedAt(ts);
    setFromCheckin(checkin);
    if (media) setCheckinMedia(media);
  }, []);

  const endWorkout = useCallback(() => {
    setWorkoutId(null);
    setStartedAt(null);
    setFromCheckin(false);
    setCheckinMedia(null);
    setIsOnScreenState(false);
  }, []);

  const setIsOnScreen = useCallback((v: boolean) => {
    setIsOnScreenState(v);
  }, []);

  const showBanner = workoutId !== null && !isOnScreen;

  return (
    <ActiveWorkoutContext.Provider
      value={{ workoutId, startedAt, fromCheckin, checkinMedia, showBanner, beginWorkout, endWorkout, setIsOnScreen }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
