import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';

export const TUTORIAL_TOTAL_STEPS = 17;

const tutorialKey = (userId: string) => `spottr_tutorial_v1_${userId}`;

const getItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
};

const setItem = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
};

interface TutorialState {
  isActive: boolean;
  step: number;
  totalSteps: number;
  nextUnlocked: boolean;
  next: () => void;
  unlock: () => void;
  skip: () => void;
}

const TutorialContext = createContext<TutorialState>({
  isActive: false,
  step: 0,
  totalSteps: TUTORIAL_TOTAL_STEPS,
  nextUnlocked: false,
  next: () => {},
  unlock: () => {},
  skip: () => {},
});

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [step, setStep] = useState(0);
  const [nextUnlocked, setNextUnlocked] = useState(false);

  // Re-check whenever the logged-in user changes so each account gets its own tutorial
  useEffect(() => {
    if (!user?.id) {
      setIsActive(false);
      setStep(0);
      return;
    }
    getItem(tutorialKey(String(user.id))).then((val) => {
      setIsActive(!val);
      setStep(0);
    });
  }, [user?.id]);

  const complete = async () => {
    if (user?.id) await setItem(tutorialKey(String(user.id)), '1');
    setIsActive(false);
    setStep(0);
  };

  const next = () => {
    setNextUnlocked(false);
    if (step >= TUTORIAL_TOTAL_STEPS - 1) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const unlock = () => setNextUnlocked(true);

  const skip = () => complete();

  return (
    <TutorialContext.Provider value={{ isActive, step, totalSteps: TUTORIAL_TOTAL_STEPS, nextUnlocked, next, unlock, skip }}>
      {children}
    </TutorialContext.Provider>
  );
}

export const useTutorial = () => useContext(TutorialContext);