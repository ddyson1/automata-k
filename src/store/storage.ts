/**
 * One call site for persistence, so web and native share the same code.
 *
 * expo-sqlite/kv-store gives an AsyncStorage-shaped API backed by SQLite on
 * iOS and by localStorage on web. Nothing here reaches the network; progress
 * stays on device, per section 11.
 */

import Store from 'expo-sqlite/kv-store';

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const memory = new Map<string, string>();

/** Used when the backing store is unavailable, so the app degrades to a session. */
const memoryStorage: Storage = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async remove(key) {
    memory.delete(key);
  },
};

export const storage: Storage = {
  async get(key) {
    try {
      return await Store.getItem(key);
    } catch {
      return memoryStorage.get(key);
    }
  },
  async set(key, value) {
    try {
      await Store.setItem(key, value);
    } catch {
      await memoryStorage.set(key, value);
    }
  },
  async remove(key) {
    try {
      await Store.removeItem(key);
    } catch {
      await memoryStorage.remove(key);
    }
  },
};

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await storage.get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await storage.set(key, JSON.stringify(value));
}
