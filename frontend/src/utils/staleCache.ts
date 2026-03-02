import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> { data: T; expiresAt: number; }

// In-memory layer — survives re-renders and re-mounts within the same app session.
// Allows synchronous reads so useState initializers can pre-populate state before the
// first paint, eliminating the loading flash on screens that have recently loaded data.
const mem = new Map<string, Entry<unknown>>();

export const staleCache = {
  /** Synchronous read from the in-memory layer only. Returns null if not cached or expired. */
  getSync<T>(key: string): T | null {
    const entry = mem.get(key) as Entry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { mem.delete(key); return null; }
    return entry.data;
  },

  /** Async read — checks memory first (instant), falls back to AsyncStorage (persisted). */
  async get<T>(key: string): Promise<T | null> {
    const memEntry = mem.get(key) as Entry<T> | undefined;
    if (memEntry) {
      if (Date.now() > memEntry.expiresAt) { mem.delete(key); }
      else { return memEntry.data; }
    }
    try {
      const raw = await AsyncStorage.getItem(`stale:${key}`);
      if (!raw) return null;
      const entry: Entry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) return null;
      mem.set(key, entry as Entry<unknown>); // warm the memory layer
      return entry.data;
    } catch { return null; }
  },

  /** Writes to memory immediately (synchronous) and persists to AsyncStorage. */
  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    try {
      const entry: Entry<T> = { data, expiresAt: Date.now() + ttlMs };
      mem.set(key, entry as Entry<unknown>); // synchronous — available for getSync instantly
      await AsyncStorage.setItem(`stale:${key}`, JSON.stringify(entry));
    } catch {}
  },
};
