import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchUnreadCount } from '../api/messaging';
import { useAuth } from './AuthContext';
import { wsManager } from '../services/websocket';
import { UnreadCount } from '../types/messaging';

interface UnreadCounts {
  total: number;
  dm: number;
  group: number;
  refresh: () => void;
  optimisticDecrement: (amount: number, type: 'dm' | 'group') => void;
  optimisticIncrement: (amount: number, type: 'dm' | 'group') => void;
}

const UnreadCountContext = createContext<UnreadCounts>({
  total: 0,
  dm: 0,
  group: 0,
  refresh: () => {},
  optimisticDecrement: () => {},
  optimisticIncrement: () => {},
});

const POLL_INTERVAL_MS = 30_000;

export function UnreadCountProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [dm, setDm] = useState(0);
  const [group, setGroup] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchUnreadCount();
      setDm(data.dm);
      setGroup(data.group);
    } catch {
      // silently ignore — badge simply won't update
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setDm(0);
      setGroup(0);
      return;
    }
    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, fetch]);

  // Server pushes accurate unread counts over WS whenever a message is delivered.
  // Listening here lets the nav bar badge update instantly without an HTTP round-trip.
  useEffect(() => {
    if (!token) return;
    const handler = (counts: UnreadCount) => {
      setDm(counts.dm);
      setGroup(counts.group);
    };
    wsManager.on('unread_update', handler);
    return () => wsManager.off('unread_update', handler);
  }, [token]);

  const optimisticDecrement = useCallback((amount: number, type: 'dm' | 'group') => {
    if (type === 'dm') setDm(prev => Math.max(0, prev - amount));
    else setGroup(prev => Math.max(0, prev - amount));
  }, []);

  const optimisticIncrement = useCallback((amount: number, type: 'dm' | 'group') => {
    if (type === 'dm') setDm(prev => prev + amount);
    else setGroup(prev => prev + amount);
  }, []);

  return (
    <UnreadCountContext.Provider value={{ total: dm + group, dm, group, refresh: fetch, optimisticDecrement, optimisticIncrement }}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}
