/**
 * Persistence, behind an interface.
 *
 * Progress stays on the device. There are no accounts and the app makes no
 * network calls, so this is localStorage and nothing else. Every read is
 * defensive: a browser in private mode, a quota refusal, or a half-written
 * value must degrade to "no saved progress" rather than to a blank screen.
 */

export interface Store {
  read<T>(key: string, fallback: T): T;
  write(key: string, value: unknown): void;
  remove(key: string): void;
}

function backing(): Storage | null {
  try {
    const probe = '__automata_k__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Used when localStorage is unavailable. The session still works; it just forgets. */
function memoryStorage(): Store {
  const map = new Map<string, string>();
  return {
    read<T>(key: string, fallback: T): T {
      const raw = map.get(key);
      if (raw === undefined) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      map.set(key, JSON.stringify(value));
    },
    remove(key) {
      map.delete(key);
    },
  };
}

export function createStorage(): Store {
  const local = backing();
  if (!local) return memoryStorage();
  return {
    read<T>(key: string, fallback: T): T {
      try {
        const raw = local.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        local.setItem(key, JSON.stringify(value));
      } catch {
        // Quota or private mode. The session keeps working, unsaved.
      }
    },
    remove(key) {
      try {
        local.removeItem(key);
      } catch {
        // As above.
      }
    },
  };
}

export const storage: Store = createStorage();
