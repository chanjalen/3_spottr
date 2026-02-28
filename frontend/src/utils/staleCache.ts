import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> { data: T; expiresAt: number; }

export const staleCache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`stale:${key}`);
      if (!raw) return null;
      const entry: Entry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) return null;
      return entry.data;
    } catch { return null; }
  },
  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    try {
      const entry: Entry<T> = { data, expiresAt: Date.now() + ttlMs };
      await AsyncStorage.setItem(`stale:${key}`, JSON.stringify(entry));
    } catch {}
  },
};
