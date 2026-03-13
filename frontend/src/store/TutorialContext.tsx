import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { apiMarkTutorialSeen } from '../api/accounts';

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

export type TabRequest = 'postsTab' | 'orgsTab' | null;

interface TutorialState {
  isActive: boolean;
  step: number;
  totalSteps: number;
  nextUnlocked: boolean;
  fabOpenRequested: boolean;
  pendingTabRequest: TabRequest;
  next: () => void;
  jumpTo: (step: number) => void;
  unlock: () => void;
  requestFABOpen: () => void;
  clearFABRequest: () => void;
  requestTab: (tab: TabRequest) => void;
  clearTabRequest: () => void;
  skip: () => void;
}

const TutorialContext = createContext<TutorialState>({
  isActive: false,
  step: 0,
  totalSteps: TUTORIAL_TOTAL_STEPS,
  nextUnlocked: false,
  fabOpenRequested: false,
  pendingTabRequest: null,
  next: () => {},
  jumpTo: () => {},
  unlock: () => {},
  requestFABOpen: () => {},
  clearFABRequest: () => {},
  requestTab: () => {},
  clearTabRequest: () => {},
  skip: () => {},
});

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [step, setStep] = useState(0);
  const [nextUnlocked, setNextUnlocked] = useState(false);
  const [fabOpenRequested, setFabOpenRequested] = useState(false);
  const [pendingTabRequest, setPendingTabRequest] = useState<TabRequest>(null);

  // Re-check whenever the logged-in user changes so each account gets its own tutorial
  useEffect(() => {
    if (!user?.id) {
      setIsActive(false);
      setStep(0);
      return;
    }
    // Backend flag wins — if the server says they've seen it, never show again
    // regardless of what's in local storage (covers new devices / reinstalls).
    if (user.has_seen_tutorial) {
      setIsActive(false);
      setStep(0);
      return;
    }
    // Fall back to local cache for users whose backend flag isn't set yet
    getItem(tutorialKey(String(user.id))).then((val) => {
      if (!val) {
        // Write immediately so closing mid-tutorial doesn't reset it on next launch
        setItem(tutorialKey(String(user.id)), '1').catch(() => {});
      }
      setIsActive(!val);
      setStep(0);
    });
  }, [user?.id, user?.has_seen_tutorial]);

  const complete = async () => {
    setIsActive(false);
    setStep(0);
    // Persist locally
    if (user?.id) setItem(tutorialKey(String(user.id)), '1').catch(() => {});
    // Persist to backend so new devices / reinstalls don't show the tutorial again
    if (user) {
      apiMarkTutorialSeen()
        .then(() => updateUser({ ...user, has_seen_tutorial: true }))
        .catch(() => {});
    }
  };

  const next = () => {
    setNextUnlocked(false);
    if (step >= TUTORIAL_TOTAL_STEPS - 1) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const jumpTo = (targetStep: number) => {
    setNextUnlocked(false);
    setStep(targetStep);
  };

  const unlock = () => setNextUnlocked(true);

  const requestFABOpen = () => setFabOpenRequested(true);
  const clearFABRequest = () => setFabOpenRequested(false);

  const requestTab = (tab: TabRequest) => setPendingTabRequest(tab);
  const clearTabRequest = () => setPendingTabRequest(null);

  const skip = () => complete();

  return (
    <TutorialContext.Provider value={{ isActive, step, totalSteps: TUTORIAL_TOTAL_STEPS, nextUnlocked, fabOpenRequested, pendingTabRequest, next, jumpTo, unlock, requestFABOpen, clearFABRequest, requestTab, clearTabRequest, skip }}>
      {children}
    </TutorialContext.Provider>
  );
}

export const useTutorial = () => useContext(TutorialContext);
