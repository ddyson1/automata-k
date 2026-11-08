/**
 * What the coach says in each lesson, and what it waits for.
 *
 * A lesson is a list of steps. Each step says one thing and offers one way to
 * act on it: feed the machine symbols, call a string before watching it, run
 * the suite, or simply read on. A step is done when what it asked for has
 * happened, which is judged from what is on the canvas and what the player has
 * just done, never from a button that says "I did it". The machines and the
 * languages they are graded against are in src/engine/lessons.ts.
 */

import type { Machine } from '../../src/engine/types';

/** A guess made before watching a string, and how the run turned out. */
export interface Prediction {
  input: string;
  /** What the player called: true for accept. */
  said: boolean;
  accepted: boolean;
  /** The run stopped for want of an arrow. */
  stuck: boolean;
  /** The label of the state the run ended in, or stopped in. */
  where: string;
}

/** The last run of the whole suite. */
export interface RunSummary {
  solved: boolean;
  passed: number;
  total: number;
  error?: string;
}

export interface LessonContext {
  machine: Machine;
  /** The string fed in so far, since it was last cleared. */
  fed: string;
  /** Symbols fed since this step began. */
  fedNow: number;
  /** Guesses whose run has finished since this step began. */
  predicted: Prediction[];
  /** The latest run of the suite since this step began. */
  ran: RunSummary | null;
}

export type Offer =
  /** Read, then press on. */
  | { kind: 'next' }
  /** A key for each symbol, and a way to start the string again. */
  | { kind: 'feed' }
  /** Call this string before it plays. */
  | { kind: 'predict'; input: string }
  /** Run the whole suite. */
  | { kind: 'run' }
  /** Nothing here: the thing to do is on the canvas. */
  | { kind: 'canvas' };

export interface Step {
  say: string;
  offer: Offer;
  /** Done when this holds. Without it the step waits for Next. */
  done?: (ctx: LessonContext) => boolean;
  /** What to say instead while something the player did is in the way. */
  help?: (ctx: LessonContext) => string | null;
  /** A state worth looking at while this step is up. */
  point?: string;
}

/** What a lesson lets you do to the machine. Moving states is always allowed. */
export interface LessonTools {
  place: boolean;
  connect: boolean;
  editRules: boolean;
  rename: boolean;
  accepting: boolean;
  start: boolean;
  remove: boolean;
}

export interface LessonScript {
  tools: LessonTools;
  steps: Step[];
}

const NOTHING: LessonTools = {
  place: false,
  connect: false,
  editRules: false,
  rename: false,
  accepting: false,
  start: false,
  remove: false,
};

const predicted = (ctx: LessonContext): boolean => ctx.predicted.length > 0;
const solved = (ctx: LessonContext): boolean => ctx.ran?.solved === true;

/** What a failed run of the suite means, in a lesson where only the rings can be wrong. */
function ringsHelp(ctx: LessonContext): string | null {
  if (!ctx.ran || ctx.ran.solved) return null;
  return (
    `${ctx.ran.passed} of ${ctx.ran.total} agree. A string is accepted when it ends on a ` +
    'double ring, so check which states have one.'
  );
}

export const SCRIPTS: Record<string, LessonScript> = {
  'lesson-reading': {
    tools: NOTHING,
    steps: [
      {
        say:
          'This is a machine, and it works like a light switch. It reads a string one ' +
          'symbol at a time. Press 1 to feed it a 1.',
        offer: { kind: 'feed' },
        done: (c) => c.fedNow > 0 && c.fed.endsWith('1'),
      },
      {
        say:
          'It followed the arrow labelled 1, from off to on. The lit state is the only ' +
          'thing the machine remembers. Now feed it a 0.',
        offer: { kind: 'feed' },
        done: (c) => c.fedNow > 0 && c.fed.endsWith('0'),
      },
      {
        say:
          'A 0 has an arrow that leads straight back, so it stays put. Feed it a few more ' +
          'symbols.',
        offer: { kind: 'feed' },
        done: (c) => c.fedNow >= 3,
      },
      {
        say:
          'When the string runs out, the machine gives its answer. The state on has a ' +
          'double ring: ending there means accept. Ending on off means reject.',
        offer: { kind: 'next' },
      },
      {
        say: 'Will it accept 0110? Call it before you watch.',
        offer: { kind: 'predict', input: '0110' },
        done: predicted,
      },
      {
        say: 'And 1011?',
        offer: { kind: 'predict', input: '1011' },
        done: predicted,
      },
      {
        say:
          'Each 1 flips the switch, so this machine accepts the strings with an odd number ' +
          'of 1s. The suite holds strings that must be accepted and strings that must not. ' +
          'Run it.',
        offer: { kind: 'run' },
        done: solved,
      },
    ],
  },

  'lesson-accepting': {
    tools: { ...NOTHING, accepting: true },
    steps: [
      {
        say:
          'This machine counts 1s: none, one, or many. No state has a double ring yet, so ' +
          'it accepts nothing. Feed it a string and see where it ends.',
        offer: { kind: 'feed' },
        done: (c) => c.fedNow >= 2,
      },
      {
        say:
          'To accept the strings with exactly one 1, the double ring goes where those ' +
          'strings end. Select the state one, then press Accepting.',
        offer: { kind: 'canvas' },
        point: 'one',
        done: (c) => c.machine.accepting.includes('one'),
      },
      {
        say: 'Will it accept the empty string, ε? It has no symbols at all.',
        offer: { kind: 'predict', input: '' },
        done: predicted,
      },
      {
        say:
          'With nothing to read the machine never leaves its start, so ε is accepted only ' +
          'when the start state has a double ring. Now run the suite.',
        offer: { kind: 'run' },
        done: solved,
        help: ringsHelp,
      },
    ],
  },

  'lesson-arrows': {
    tools: { ...NOTHING, connect: true, editRules: true },
    steps: [
      {
        say:
          'This machine checks whether a string has an even number of symbols. 11 has two. ' +
          'Will it accept 11?',
        offer: { kind: 'predict', input: '11' },
        done: predicted,
      },
      {
        say:
          'It got stuck. From odd there is no arrow for 1, so the run had nowhere to go and ' +
          'the string was rejected. Draw the missing arrow: drag from the edge of odd to even, ' +
          'then choose 1.',
        offer: { kind: 'canvas' },
        point: 'odd',
        done: (c) =>
          c.machine.transitions.some((t) => t.from === 'odd' && t.to === 'even' && t.read === '1'),
        help: (c) => {
          const fromOdd = c.machine.transitions.filter((t) => t.from === 'odd');
          if (fromOdd.filter((t) => t.read === '0').length > 1) {
            return 'odd already has an arrow for 0. Press the new label and change it to 1.';
          }
          if (fromOdd.some((t) => t.read === '1' && t.to !== 'even')) {
            return (
              'That arrow reads 1 but goes to the wrong place: after odd, one more symbol ' +
              'makes the length even.'
            );
          }
          return null;
        },
      },
      {
        say: 'Will it accept 11 now?',
        offer: { kind: 'predict', input: '11' },
        done: predicted,
      },
      {
        say: 'Every state now has an arrow for every symbol. Run the suite.',
        offer: { kind: 'run' },
        done: solved,
        help: (c) =>
          c.ran && !c.ran.solved
            ? `${c.ran.passed} of ${c.ran.total} agree. Each symbol should flip the machine ` +
              'between even and odd.'
            : null,
      },
    ],
  },
};
