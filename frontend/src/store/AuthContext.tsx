import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { UserBrief } from '../types/user';

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
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isLoading: true,
  currentStreak: 0,
  setCurrentStreak: () => {},
  signIn: async () => {},
  signOut: async () => {},
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

  const signIn = async (newToken: string, newUser: UserBrief) => {
    await setItem('auth_token', newToken);
    await setItem('auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setCurrentStreak(newUser.streak ?? 0);
  };

  const signOut = async () => {
    await deleteItem('auth_token');
    await deleteItem('auth_user');
    setToken(null);
    setUser(null);
    setCurrentStreak(0);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, currentStreak, setCurrentStreak, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
