import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { UserBrief } from '../types/user';
import { wsManager } from '../services/websocket';

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
  signIn: (token: string, user: UserBrief) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserBrief | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getItem('auth_token');
      const storedUser = await getItem('auth_user');
      if (stored) setToken(stored);
      if (storedUser) setUser(JSON.parse(storedUser));
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
    setToken(newToken);
    setUser(newUser);
  };

  const signOut = async () => {
    await deleteItem('auth_token');
    await deleteItem('auth_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
