/**
 * One sound, for the moment the checks come back green.
 *
 * Synthesised rather than fetched. Section 11 says the app makes no network
 * calls, and an audio file would be one; it would also be the largest asset in
 * a 189KB build, for two notes. WebAudio makes them for nothing.
 *
 * Two notes a fifth apart, soft attack, long decay, quiet. theme.css asks for
 * "settled, not congratulated" and that goes for the ears as well: this is the
 * sound of a latch closing, not a fanfare.
 *
 * The context is made on the first play, never at import. Browsers refuse to
 * start one outside a user gesture, and the only thing that plays this is a
 * button press, so by the time it is needed the gesture has happened.
 */

import { storage } from './storage';

const KEY = 'automata-k.sound';

/** A fifth. The second note lands while the first is still ringing. */
const NOTES: { hz: number; at: number }[] = [
  { hz: 587.33, at: 0 }, // D5
  { hz: 880.0, at: 0.085 }, // A5
];

const PEAK = 0.16;
const DECAY = 0.62;

let context: AudioContext | null = null;
let enabled = storage.read<boolean>(KEY, true);

type WithWebkit = typeof globalThis & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function acquire(): AudioContext | null {
  if (context) return context;
  const scope = globalThis as WithWebkit;
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * One note: a triangle for the body, a sine an octave up at a fifth of the
 * gain for the strike. Both fade on the same curve, so it reads as one sound.
 */
function note(ctx: AudioContext, hz: number, at: number): void {
  const start = ctx.currentTime + at;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(PEAK, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + DECAY);
  gain.connect(ctx.destination);

  for (const [shape, multiple, level] of [
    ['triangle', 1, 1],
    ['sine', 2, 0.2],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(hz * multiple, start);
    const trim = ctx.createGain();
    trim.gain.setValueAtTime(level, start);
    osc.connect(trim).connect(gain);
    osc.start(start);
    osc.stop(start + DECAY + 0.02);
  }
}

/** Everything the level asked for agreed. */
export function chime(): void {
  if (!enabled) return;
  const ctx = acquire();
  if (!ctx) return;
  // Suspended is the normal state on a page that has not made a sound yet.
  if (ctx.state === 'suspended') void ctx.resume();
  try {
    for (const n of NOTES) note(ctx, n.hz, n.at);
  } catch {
    // A context can be closed under us on some browsers. Silence is fine.
  }
}

export const soundOn = (): boolean => enabled;

export function setSound(on: boolean): void {
  enabled = on;
  storage.write(KEY, on);
  if (on) chime();
}
