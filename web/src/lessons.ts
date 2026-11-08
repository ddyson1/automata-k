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
  /**
   * A state worth looking at while this step is up: its id, or a way to find
   * it in what is on the canvas, for a state the player placed themselves.
   */
  point?: string | ((ctx: LessonContext) => string | null | undefined);
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

/** Whether the canvas has the arrow from `from` to `to` reading `read`. */
type Id = string | null | undefined;

const has = (ctx: LessonContext, from: Id, to: Id, read: string): boolean =>
  ctx.machine.transitions.some((t) => t.from === from && t.to === to && t.read === read);

const labelOf = (ctx: LessonContext, id: Id): string =>
  ctx.machine.states.find((s) => s.id === id)?.label ?? '?';

/** An arrow drawn between the right two states for the wrong symbol, said as a fix. */
function wrongSymbol(ctx: LessonContext, from: Id, to: Id, want: string): string | null {
  if (has(ctx, from, to, want)) return null;
  const drawn = ctx.machine.transitions.find((t) => t.from === from && t.to === to);
  return drawn ? `That arrow reads ${drawn.read}. Press its label and change it to ${want}.` : null;
}

/** What a failed run means in a lesson, plainly. */
function failedRun(ctx: LessonContext, hint: string): string | null {
  if (!ctx.ran || ctx.ran.solved) return null;
  if (ctx.ran.error) return `${ctx.ran.error} ${hint}`;
  return `${ctx.ran.passed} of ${ctx.ran.total} agree. ${hint}`;
}

// Lesson 5 builds on an empty canvas, so its states are found rather than named.
const others = (ctx: LessonContext) => ctx.machine.states.filter((s) => s.id !== ctx.machine.start);
/** Where "a 1 has been seen" lives: wherever the start's 1 goes, or the ringed state. */
const seenOf = (ctx: LessonContext): string | undefined =>
  ctx.machine.transitions.find(
    (t) => t.from === ctx.machine.start && t.read === '1' && t.to !== ctx.machine.start,
  )?.to ?? ctx.machine.accepting.find((id) => id !== ctx.machine.start);

// Lesson 6 adds one state of the player's own to s and yes.
const deadOf = (ctx: LessonContext): string | undefined =>
  ctx.machine.transitions.find(
    (t) => t.from === 's' && t.read === '0' && t.to !== 's' && t.to !== 'yes',
  )?.to;

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

  'lesson-memory': {
    tools: { ...NOTHING, connect: true, editRules: true },
    steps: [
      {
        say:
          'Each state of a machine stands for something it remembers. Here it is one answer: ' +
          'does what has been read so far end with 0? no is where it starts, and yes has the ' +
          'double ring. Reading a 0 makes the answer yes. Draw that arrow: from no to yes, for 0.',
        offer: { kind: 'canvas' },
        point: 'no',
        done: (c) => has(c, 'no', 'yes', '0'),
        help: (c) => wrongSymbol(c, 'no', 'yes', '0'),
      },
      {
        say:
          'From yes, a 0 keeps the answer yes, so its arrow loops back. Press on the edge of yes ' +
          'and let go on yes itself, then choose 0.',
        offer: { kind: 'canvas' },
        point: 'yes',
        done: (c) => has(c, 'yes', 'yes', '0'),
        help: (c) => wrongSymbol(c, 'yes', 'yes', '0'),
      },
      {
        say:
          'Reading a 1 makes the answer no, wherever the machine was. Draw both arrows for 1: ' +
          'one from yes to no, and a loop on no.',
        offer: { kind: 'canvas' },
        point: (c) => (has(c, 'yes', 'no', '1') ? 'no' : 'yes'),
        done: (c) => has(c, 'yes', 'no', '1') && has(c, 'no', 'no', '1'),
        help: (c) => wrongSymbol(c, 'yes', 'no', '1') ?? wrongSymbol(c, 'no', 'no', '1'),
      },
      {
        say: 'Will it accept 10?',
        offer: { kind: 'predict', input: '10' },
        done: predicted,
      },
      {
        say: 'Every arrow says what one symbol does to the answer. Run the suite.',
        offer: { kind: 'run' },
        done: solved,
        help: (c) => failedRun(c, 'After a 0 the answer is yes; after a 1 it is no.'),
      },
    ],
  },

  'lesson-own': {
    tools: {
      ...NOTHING,
      place: true,
      connect: true,
      editRules: true,
      accepting: true,
      remove: true,
    },
    steps: [
      {
        say:
          'This canvas is empty: the machine is yours to build. It should accept the strings ' +
          'that contain a 1. Double click the canvas, or tap it twice, to place a state. The ' +
          'first state you place is where the machine starts.',
        offer: { kind: 'canvas' },
        done: (c) => c.machine.states.length >= 1,
      },
      {
        say:
          'What does the machine need to remember to know whether a 1 has turned up? Only yes ' +
          'or no. Two answers, so two states. Place a second one.',
        offer: { kind: 'canvas' },
        done: (c) => c.machine.states.length >= 2,
      },
      {
        say:
          'Your second state means a 1 has been seen, which is exactly when to accept. Select ' +
          'it and press Accepting.',
        offer: { kind: 'canvas' },
        point: (c) => others(c)[0]?.id,
        done: (c) =>
          c.machine.accepting.some((id) => id !== c.machine.start) &&
          !c.machine.accepting.includes(c.machine.start ?? ''),
        help: (c) =>
          c.machine.start !== null && c.machine.accepting.includes(c.machine.start)
            ? 'The start stands for nothing read yet, so no 1 has been seen: select it and ' +
              'press Accepting again to take its ring off.'
            : null,
      },
      {
        say:
          'Now the arrows. From the start, a 1 means a 1 has been seen: drag from the edge of ' +
          'the start to your accepting state, and choose 1.',
        offer: { kind: 'canvas' },
        point: (c) => c.machine.start,
        done: (c) =>
          c.machine.transitions.some(
            (t) =>
              t.from === c.machine.start && t.read === '1' && c.machine.accepting.includes(t.to),
          ),
        help: (c) => wrongSymbol(c, c.machine.start, c.machine.accepting[0], '1'),
      },
      {
        say:
          'A 0 changes nothing, so from the start it loops back. Press on the edge of the start ' +
          'and let go on the start itself, then choose 0.',
        offer: { kind: 'canvas' },
        point: (c) => c.machine.start,
        done: (c) => has(c, c.machine.start, c.machine.start, '0'),
        help: (c) => wrongSymbol(c, c.machine.start, c.machine.start, '0'),
      },
      {
        say:
          'Once a 1 has been seen, nothing can unsee it, so the accepting state loops back to ' +
          'itself on both symbols. Draw a loop on it for 0, then another for 1.',
        offer: { kind: 'canvas' },
        point: seenOf,
        done: (c) => {
          const seen = seenOf(c);
          return has(c, seen, seen, '0') && has(c, seen, seen, '1');
        },
      },
      {
        say: 'Will it accept 000?',
        offer: { kind: 'predict', input: '000' },
        done: predicted,
      },
      {
        say: 'You decided what to remember, and the machine followed. Run the suite.',
        offer: { kind: 'run' },
        done: solved,
        help: (c) =>
          failedRun(c, 'Check each state has an arrow for 0 and for 1, and only the second rings.'),
      },
    ],
  },

  'lesson-trapped': {
    tools: { ...NOTHING, place: true, connect: true, editRules: true, remove: true },
    steps: [
      {
        say: 'This machine accepts the strings that start with 1. Will it accept 01?',
        offer: { kind: 'predict', input: '01' },
        done: predicted,
      },
      {
        say:
          'Rejected, and rightly: 01 starts with 0. But it was rejected by getting stuck, ' +
          'because s has no arrow for 0. Give that 0 somewhere to go: a state that never ' +
          'accepts and never lets go, called a dead state. Place one near s.',
        offer: { kind: 'canvas' },
        point: 's',
        done: (c) => c.machine.states.length >= 3,
      },
      {
        say: 'Draw the arrow s is missing: from s to your new state, for 0.',
        offer: { kind: 'canvas' },
        point: 's',
        done: (c) => deadOf(c) !== undefined,
        help: (c) => {
          if (has(c, 's', 'yes', '0')) {
            return (
              'That arrow sends 0 to yes, which accepts, so 01 would be accepted. Press its ' +
              'label, delete it, and draw it to the new state instead.'
            );
          }
          if (has(c, 's', 's', '0')) {
            return (
              'That loop keeps the machine in s, where a later 1 would still be accepted. ' +
              'The 0 should go to the new state.'
            );
          }
          return null;
        },
      },
      {
        say:
          'A dead state never lets go: whatever comes next, the string stays rejected. Draw a ' +
          'loop on it for 0, then another for 1.',
        offer: { kind: 'canvas' },
        point: deadOf,
        done: (c) => {
          const dead = deadOf(c);
          return has(c, dead, dead, '0') && has(c, dead, dead, '1');
        },
        help: (c) => {
          const dead = deadOf(c);
          const out = c.machine.transitions.find((t) => t.from === dead && t.to !== dead);
          return out
            ? `An arrow leaves ${labelOf(c, dead)}, but a dead state never lets go. Delete it ` +
                'and loop back instead.'
            : null;
        },
      },
      {
        say: 'Will it accept 01 now?',
        offer: { kind: 'predict', input: '01' },
        done: predicted,
      },
      {
        say:
          'Rejected again, but now by ending somewhere rather than by getting stuck. Run the ' +
          'suite.',
        offer: { kind: 'run' },
        done: solved,
        help: (c) => failedRun(c, 'Only yes rings, and nothing leaves the dead state.'),
      },
    ],
  },
};
