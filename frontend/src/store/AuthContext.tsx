import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { UserBrief } from '../types/user';
import { wsManager } from '../services/websocket';
import { setTokenCache } from '../api/client';
import { apiUpdateProfile } from '../api/accounts';

const getItem = async (key: string) => {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
};

const setItem = async (key: string, value: string) => {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
};

const deleteItem = async (key: string) => {
  if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
  return SecureStore.deleteItemAsync(key);
};

interface AuthState {
  token: string | null;
  user: UserBrief | null;
  isLoading: boolean;
  currentStreak: number;
  setCurrentStreak: (n: number) => void;
  signIn: (token: string, user: UserBrief) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: UserBrief) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isLoading: true,
  currentStreak: 0,
  setCurrentStreak: () => {},
  signIn: async () => {},
  signOut: async () => {},
  updateUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserBrief | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStreak, setCurrentStreak] = useState(0);

  useEffect(() => {
    (async () => {
      const stored = await getItem('auth_token');
      const storedUser = await getItem('auth_user');
      if (stored) setToken(stored);
      if (storedUser) {
        const parsed: UserBrief = JSON.parse(storedUser);
        setUser(parsed);
        setCurrentStreak(parsed.streak ?? 0);
      }
      setIsLoading(false);
    })();
  }, []);

  // Connect WebSocket when authenticated, disconnect on sign-out.
  useEffect(() => {
    if (token) {
      wsManager.connect();
    } else {
      wsManager.disconnect();
    }
  }, [token]);

  // Forward AppState changes to the WS manager so it reconnects on foreground
  // and gracefully disconnects after 30s in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', wsManager.handleAppState);
    return () => sub.remove();
  }, []);

  const signIn = async (newToken: string, newUser: UserBrief) => {
    await setItem('auth_token', newToken);
    await setItem('auth_user', JSON.stringify(newUser));
    setTokenCache(newToken); // keep apiClient interceptor in sync immediately
    setToken(newToken);
    setUser(newUser);
    setCurrentStreak(newUser.streak ?? 0);

    // Sync device timezone to backend so streak resets fire at the right local time
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) await apiUpdateProfile({ timezone: tz });
    } catch {
      // Non-critical — don't block sign-in if this fails
    }
  };

  const signOut = async () => {
    await deleteItem('auth_token');
    await deleteItem('auth_user');
    setTokenCache(undefined); // clear interceptor cache
    setToken(null);
    setUser(null);
    setCurrentStreak(0);
  };

  const updateUser = async (newUser: UserBrief) => {
    await setItem('auth_user', JSON.stringify(newUser));
    setUser(newUser);
    setCurrentStreak(newUser.streak ?? 0);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, currentStreak, setCurrentStreak, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
