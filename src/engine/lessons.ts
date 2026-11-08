/**
 * The Learn floor: lessons that come before level 1.
 *
 * The campaign assumes you already know what a finite automaton is. These
 * teach it, one idea at a time, by handing you a machine that is nearly there
 * and asking for the one thing the idea is about: watch it read, choose where
 * it says yes, give it the arrow it is missing. Each is graded exactly like a
 * level, against its language, so a lesson is a level with a starting machine.
 * The script that talks you through it reacts to what you do on screen, so it
 * lives with the web app (web/src/lessons.ts) rather than here.
 *
 * They are not in LEVELS. The campaign's numbering and unlocking, the golden
 * fixture and the iOS port are all about the forty-two, and none of that
 * should move because a tutorial was put in front of it.
 */

import type { Grammar, Level, Machine } from './types';

export interface Lesson {
  id: string;
  /** 1-based position on the Learn floor. */
  index: number;
  title: string;
  /** What the lesson is about, in a line, for the climb's panel. */
  pitch: string;
  /** The language and the suite that grades it. */
  level: Level;
  /** What is on the canvas when the lesson opens. */
  start: Machine;
  /** A machine that finishes the lesson. The tests hold it to the language. */
  answer: Machine;
  /** The idea, in a sentence or two, said when the lesson is done. */
  takeaway: string;
}

type StateSpec = [id: string, label: string, x: number, y: number];
type RuleSpec = [from: string, to: string, read: string];

const machine = (
  id: string,
  states: StateSpec[],
  start: string,
  accepting: string[],
  rules: RuleSpec[],
): Machine => ({
  states: states.map(([sid, label, x, y]) => ({ id: sid, label, x, y })),
  start,
  accepting,
  transitions: rules.map(([from, to, read], i) => ({ id: `${id}-t${i}`, from, to, read })),
});

const grammar = (nonTerminals: string[], productions: [string, string][]): Grammar => ({
  nonTerminals,
  terminals: ['0', '1'],
  start: nonTerminals[0] as string,
  productions: productions.map(([lhs, rhs]) => ({ lhs, rhs })),
});

const ones = (w: string): number => [...w].filter((c) => c === '1').length;

/** A lesson's level: a finite language over 0 and 1, with par from its answer. */
const level = (
  index: number,
  fields: Pick<Level, 'id' | 'title' | 'goal' | 'tests' | 'accepts' | 'setBuilder' | 'grammar'> &
    Partial<Pick<Level, 'theory' | 'hint'>>,
  par: number,
): Level => ({
  index,
  type: 'DFA',
  alphabet: ['0', '1'],
  par,
  theory: '',
  hint: '',
  chomsky: 3,
  exhaustiveMaxLength: 6,
  ...fields,
});

const READING_MACHINE = machine(
  'lesson-reading',
  [
    ['off', 'off', 105, 230],
    ['on', 'on', 235, 230],
  ],
  'off',
  ['on'],
  [
    ['off', 'off', '0'],
    ['off', 'on', '1'],
    ['on', 'off', '1'],
    ['on', 'on', '0'],
  ],
);

const COUNT_STATES: StateSpec[] = [
  ['none', 'none', 65, 230],
  ['one', 'one', 170, 230],
  ['many', 'many', 275, 230],
];
const COUNT_RULES: RuleSpec[] = [
  ['none', 'none', '0'],
  ['none', 'one', '1'],
  ['one', 'one', '0'],
  ['one', 'many', '1'],
  ['many', 'many', '0'],
  ['many', 'many', '1'],
];

const PARITY_STATES: StateSpec[] = [
  ['even', 'even', 105, 230],
  ['odd', 'odd', 235, 230],
];
const PARITY_RULES: RuleSpec[] = [
  ['even', 'odd', '0'],
  ['even', 'odd', '1'],
  ['odd', 'even', '0'],
];

export const LESSONS: Lesson[] = [
  {
    id: 'lesson-reading',
    index: 1,
    title: 'Reading',
    pitch: 'Watch a machine read a string, one symbol at a time.',
    level: level(
      1,
      {
        id: 'lesson-reading',
        title: 'Reading',
        goal: 'Accept the strings with an odd number of 1s.',
        tests: ['', '0', '1', '00', '01', '10', '11', '011', '101', '111', '0110', '1011'],
        accepts: (w) => ones(w) % 2 === 1,
        setBuilder: 'L = { w ∈ {0,1}* : w has an odd number of 1s }',
        grammar: grammar(
          ['S', 'A'],
          [
            ['S', '0S'],
            ['S', '1A'],
            ['A', '0A'],
            ['A', '1S'],
            ['A', ''],
          ],
        ),
      },
      2,
    ),
    start: READING_MACHINE,
    answer: READING_MACHINE,
    takeaway:
      'That is a finite automaton: states, arrows labelled with symbols, one start, and double ' +
      'rings for yes. It reads a string one symbol at a time, and all it remembers is where it is.',
  },
  {
    id: 'lesson-accepting',
    index: 2,
    title: 'Accepting',
    pitch: 'Choose where a machine says yes.',
    level: level(
      2,
      {
        id: 'lesson-accepting',
        title: 'Accepting',
        goal: 'Accept the strings with exactly one 1.',
        tests: ['', '0', '1', '00', '01', '10', '11', '010', '0001', '1000', '101', '0110'],
        accepts: (w) => ones(w) === 1,
        setBuilder: 'L = { w ∈ {0,1}* : w has exactly one 1 }',
        grammar: grammar(
          ['S', 'A'],
          [
            ['S', '0S'],
            ['S', '1A'],
            ['A', '0A'],
            ['A', ''],
          ],
        ),
      },
      3,
    ),
    start: machine('lesson-accepting', COUNT_STATES, 'none', [], COUNT_RULES),
    answer: machine('lesson-accepting', COUNT_STATES, 'none', ['one'], COUNT_RULES),
    takeaway:
      'A string is accepted when it ends in a state with a double ring. A machine can have ' +
      'several, or none, and the empty string is accepted only when the start state has one.',
  },
  {
    id: 'lesson-arrows',
    index: 3,
    title: 'Every symbol goes somewhere',
    pitch: 'Find the arrow a machine is missing, and draw it.',
    level: level(
      3,
      {
        id: 'lesson-arrows',
        title: 'Every symbol goes somewhere',
        goal: 'Accept the strings whose length is even.',
        tests: ['', '0', '1', '00', '01', '10', '11', '000', '101', '0110', '1111', '10101'],
        accepts: (w) => w.length % 2 === 0,
        setBuilder: 'L = { w ∈ {0,1}* : |w| is even }',
        grammar: grammar(
          ['S', 'A'],
          [
            ['S', '0A'],
            ['S', '1A'],
            ['S', ''],
            ['A', '0S'],
            ['A', '1S'],
          ],
        ),
      },
      2,
    ),
    start: machine('lesson-arrows', PARITY_STATES, 'even', ['even'], PARITY_RULES),
    answer: machine('lesson-arrows', PARITY_STATES, 'even', ['even'], [
      ...PARITY_RULES,
      ['odd', 'even', '1'],
    ]),
    takeaway:
      'From every state, every symbol needs an arrow, so the machine always knows where to go. ' +
      'Where one is missing the run stops dead, and the string is rejected.',
  },
];

export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((lesson) => [lesson.id, lesson]),
);
