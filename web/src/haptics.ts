/**
 * Haptics, where the platform has them.
 *
 * Safari on iOS does not implement the Vibration API, so on the platform this
 * matters most these all do nothing. That is fine: they are confirmation, never
 * information, and every one of them accompanies a visible change.
 */

/**
 * Whether motion is unwelcome. The setting on <html> wins in both directions;
 * without one, the system's preference decides. theme.css reads the same
 * attribute, so a buzz and a transition always agree.
 */
export const reducedMotion = (): boolean => {
  const choice = document.documentElement.getAttribute('data-motion');
  if (choice === 'reduce') return true;
  if (choice === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const can = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.vibrate === 'function' &&
  !reducedMotion();

const buzz = (pattern: number | number[]): void => {
  if (!can()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers reject vibration outside a user gesture. Nothing to do.
  }
};

/** A state landed, an arrow was made. */
export const tap = (): void => buzz(8);

/** The suite turned green. */
export const success = (): void => buzz([12, 60, 22]);

/** The machine is not well formed. */
export const warn = (): void => buzz([14, 50, 14]);
