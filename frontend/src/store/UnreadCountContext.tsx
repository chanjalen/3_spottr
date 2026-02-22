import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchUnreadCount } from '../api/messaging';
import { useAuth } from './AuthContext';

interface UnreadCounts {
  total: number;
  dm: number;
  group: number;
  refresh: () => void;
}

const UnreadCountContext = createContext<UnreadCounts>({
  total: 0,
  dm: 0,
  group: 0,
  refresh: () => {},
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

  return (
    <UnreadCountContext.Provider value={{ total: dm + group, dm, group, refresh: fetch }}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}
