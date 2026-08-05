/**
 * Web key value backend: localStorage.
 *
 * Same interface as the native one, so storage.ts and every call site above it
 * stay identical. Using localStorage rather than the SQLite WebAssembly build
 * keeps the web bundle to a single file with no worker, which also means the
 * app runs inside a sandboxed frame.
 */

import type { KvBackend } from './kv-types';

const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Some embeddings deny storage access outright.
    return null;
  }
};

export const backend: KvBackend = {
  async getItem(key) {
    return store()?.getItem(key) ?? null;
  },
  async setItem(key, value) {
    store()?.setItem(key, value);
  },
  async removeItem(key) {
    store()?.removeItem(key);
  },
};
