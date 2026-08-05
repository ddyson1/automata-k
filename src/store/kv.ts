/**
 * Native key value backend: expo-sqlite/kv-store.
 *
 * Metro picks kv.web.ts on the web target instead, so the web bundle carries
 * neither the SQLite WebAssembly payload nor its worker.
 */

import Store from 'expo-sqlite/kv-store';

import type { KvBackend } from './kv-types';

export const backend: KvBackend = {
  getItem: (key) => Store.getItem(key),
  setItem: (key, value) => Store.setItem(key, value),
  removeItem: (key) => Store.removeItem(key),
};
