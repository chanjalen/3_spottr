import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchUnreadCount } from '../api/messaging';
import { useAuth } from './AuthContext';
import { wsManager } from '../services/websocket';
import { UnreadCount } from '../types/messaging';

interface UnreadCounts {
  total: number;
  dm: number;
  group: number;
  org: number;
  refresh: () => void;
  optimisticDecrement: (amount: number, type: 'dm' | 'group' | 'org') => void;
  optimisticIncrement: (amount: number, type: 'dm' | 'group' | 'org') => void;
}

const UnreadCountContext = createContext<UnreadCounts>({
  total: 0,
  dm: 0,
  group: 0,
  org: 0,
  refresh: () => {},
  optimisticDecrement: () => {},
  optimisticIncrement: () => {},
});

const POLL_INTERVAL_MS = 30_000;

export function UnreadCountProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [dm, setDm] = useState(0);
  const [group, setGroup] = useState(0);
  const [org, setOrg] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchUnreadCount();
      setDm(data.dm);
      setGroup(data.group);
      setOrg(data.org);
    } catch {
      // silently ignore — badge simply won't update
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setDm(0);
      setGroup(0);
      setOrg(0);
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
      setOrg(counts.org);
    };
    wsManager.on('unread_update', handler);
    return () => wsManager.off('unread_update', handler);
  }, [token]);

  // Increment org badge when a new announcement arrives over WS (skip own posts).
  useEffect(() => {
    if (!token) return;
    const handler = (ann: { author_id: string }) => {
      if (String(ann.author_id) === String(user?.id)) return;
      setOrg(prev => prev + 1);
    };
    wsManager.on('new_announcement', handler);
    return () => wsManager.off('new_announcement', handler);
  }, [token, user?.id]);

  // Re-fetch accurate org count whenever a join request is created, accepted, or denied.
  useEffect(() => {
    if (!token) return;
    wsManager.on('org_join_request', fetch);
    return () => wsManager.off('org_join_request', fetch);
  }, [token, fetch]);

  const optimisticDecrement = useCallback((amount: number, type: 'dm' | 'group' | 'org') => {
    if (type === 'dm') setDm(prev => Math.max(0, prev - amount));
    else if (type === 'group') setGroup(prev => Math.max(0, prev - amount));
    else setOrg(prev => Math.max(0, prev - amount));
  }, []);

  const optimisticIncrement = useCallback((amount: number, type: 'dm' | 'group' | 'org') => {
    if (type === 'dm') setDm(prev => prev + amount);
    else if (type === 'group') setGroup(prev => prev + amount);
    else setOrg(prev => prev + amount);
  }, []);

  return (
    <UnreadCountContext.Provider value={{ total: dm + group + org, dm, group, org, refresh: fetch, optimisticDecrement, optimisticIncrement }}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}
