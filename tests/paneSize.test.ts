import { describe, expect, it } from 'vitest';
import {
  PANE_DEFAULT,
  PANE_MAX,
  PANE_MIN,
  STAGE_MIN,
  clampPaneWidth,
  readPane,
  writePane,
} from '../web/src/paneSize';
import type { PaneStore } from '../web/src/paneSize';

function memoryStore(): PaneStore {
  const map = new Map<string, unknown>();
  return {
    read: <T>(key: string, fallback: T): T => (map.has(key) ? (map.get(key) as T) : fallback),
    write: (key, value) => void map.set(key, value),
  };
}

describe('pane size', () => {
  it('keeps the width between its bounds', () => {
    expect(clampPaneWidth(100, 1600)).toBe(PANE_MIN);
    expect(clampPaneWidth(9999, 1600)).toBe(PANE_MAX);
    expect(clampPaneWidth(450.4, 1600)).toBe(450);
  });

  it('never takes the canvas below STAGE_MIN', () => {
    expect(clampPaneWidth(PANE_MAX, 900)).toBe(900 - STAGE_MIN);
    // On a window too small for both, the pane keeps its minimum.
    expect(clampPaneWidth(PANE_MAX, 600)).toBe(PANE_MIN);
  });

  it('falls back to the default for nonsense', () => {
    expect(clampPaneWidth(Number.NaN, 1600)).toBe(PANE_DEFAULT);
  });

  it('round-trips through storage', () => {
    const store = memoryStore();
    expect(readPane(store)).toEqual({ width: PANE_DEFAULT, collapsed: false });
    writePane(store, { width: 444, collapsed: true });
    expect(readPane(store)).toEqual({ width: 444, collapsed: true });
    // A damaged entry falls back rather than throwing.
    store.write('automata-k.pane.v1', 'garbage');
    expect(readPane(store)).toEqual({ width: PANE_DEFAULT, collapsed: false });
  });
});
