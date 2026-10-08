/**
 * How wide the pane is on a wide window, and whether it is folded away.
 *
 * A view preference, so it lives beside the theme in storage rather than in
 * the game: nothing about a level changes when the pane does. On a phone the
 * pane is a rail across the top and neither value applies.
 *
 * The store is passed in (level.ts gives it storage.ts's) so this file stays
 * free of the DOM and can be unit tested alongside the engine.
 */

/** The slice of storage.ts's Store this needs. */
export interface PaneStore {
  read<T>(key: string, fallback: T): T;
  write(key: string, value: unknown): void;
}

const KEY = 'automata-k.pane.v1';

/** Five tab labels fit 320px, only just; the old fixed column was 380. */
export const PANE_MIN = 320;
export const PANE_MAX = 560;
export const PANE_DEFAULT = 380;
/** The canvas never gets narrower than this to make room for the pane. */
export const STAGE_MIN = 420;

export interface PanePrefs {
  width: number;
  collapsed: boolean;
}

/** The width the pane can actually have in a window this wide. */
export function clampPaneWidth(width: number, viewport: number): number {
  const ceiling = Math.max(PANE_MIN, Math.min(PANE_MAX, viewport - STAGE_MIN));
  const w = Number.isFinite(width) ? width : PANE_DEFAULT;
  return Math.round(Math.min(ceiling, Math.max(PANE_MIN, w)));
}

export function readPane(store: PaneStore): PanePrefs {
  const raw = store.read<Partial<PanePrefs> | null>(KEY, null);
  return {
    width: typeof raw?.width === 'number' ? raw.width : PANE_DEFAULT,
    collapsed: raw?.collapsed === true,
  };
}

export function writePane(store: PaneStore, prefs: PanePrefs): void {
  store.write(KEY, prefs);
}
