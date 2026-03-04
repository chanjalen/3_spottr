import React, { createContext, useCallback, useContext, useState } from 'react';

interface ActiveWorkoutContextType {
  workoutId: string | null;
  startedAt: number | null; // Unix ms timestamp
  fromCheckin: boolean;
  showBanner: boolean;      // workoutId !== null && !isOnScreen
  beginWorkout: (id: string, startedAt: number, fromCheckin: boolean) => void;
  endWorkout: () => void;
  setIsOnScreen: (v: boolean) => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  workoutId: null,
  startedAt: null,
  fromCheckin: false,
  showBanner: false,
  beginWorkout: () => {},
  endWorkout: () => {},
  setIsOnScreen: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fromCheckin, setFromCheckin] = useState(false);
  const [isOnScreen, setIsOnScreenState] = useState(false);

  const beginWorkout = useCallback((id: string, ts: number, checkin: boolean) => {
    setWorkoutId(id);
    setStartedAt(ts);
    setFromCheckin(checkin);
  }, []);

  const endWorkout = useCallback(() => {
    setWorkoutId(null);
    setStartedAt(null);
    setFromCheckin(false);
    setIsOnScreenState(false);
  }, []);

  const setIsOnScreen = useCallback((v: boolean) => {
    setIsOnScreenState(v);
  }, []);

  const showBanner = workoutId !== null && !isOnScreen;

  return (
    <ActiveWorkoutContext.Provider
      value={{ workoutId, startedAt, fromCheckin, showBanner, beginWorkout, endWorkout, setIsOnScreen }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
