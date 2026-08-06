/**
 * One verified machine per level.
 *
 * These drive the "reveal solution" feature and are the fixtures the
 * verification suite in tests/engine.test.ts runs exhaustively against each
 * level's `accepts` predicate. Coordinates are logical canvas units and are
 * asserted to sit inside CANVAS by the same suite.
 */

import { BLANK, EPSILON, STACK_BOTTOM, type Machine, type Move } from './types';

type StateSpec = [id: string, label: string, x: number, y: number];
/** DFA and NFA: [from, to, read]. */
type FaSpec = [from: string, to: string, read: string];
/** PDA: [from, to, read, pop, push]. */
type PdaSpec = [from: string, to: string, read: string, pop: string, push: string];
/** TM: [from, to, read, write, move]. */
type TmSpec = [from: string, to: string, read: string, write: string, move: Move];

const build = (
  id: string,
  states: StateSpec[],
  start: string,
  accepting: string[],
  rules: (FaSpec | PdaSpec | TmSpec)[],
  kind: 'fa' | 'pda' | 'tm',
): Machine => ({
  states: states.map(([sid, label, x, y]) => ({ id: sid, label, x, y })),
  start,
  accepting,
  transitions: rules.map((r, i) => {
    const base = { id: `${id}-t${i}`, from: r[0], to: r[1], read: r[2] };
    if (kind === 'pda') {
      const p = r as PdaSpec;
      return { ...base, pop: p[3], push: p[4] };
    }
    if (kind === 'tm') {
      const t = r as TmSpec;
      return { ...base, write: t[3], move: t[4] };
    }
    return base;
  }),
});

const E = EPSILON;
const B = BLANK;
const $ = STACK_BOTTOM;

export const SOLUTIONS: Record<string, Machine> = {
  // 1. ends in 1
  'dfa-ends-in-1': build(
    'sol1',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 245, 230],
    ],
    'q0',
    ['q1'],
    [
      ['q0', 'q0', '0'],
      ['q0', 'q1', '1'],
      ['q1', 'q0', '0'],
      ['q1', 'q1', '1'],
    ],
    'fa',
  ),

  // 2. even number of zeros
  'dfa-even-zeros': build(
    'sol2',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 245, 230],
    ],
    'q0',
    ['q0'],
    [
      ['q0', 'q0', '1'],
      ['q0', 'q1', '0'],
      ['q1', 'q1', '1'],
      ['q1', 'q0', '0'],
    ],
    'fa',
  ),

  // 3. contains 01
  'dfa-contains-01': build(
    'sol3',
    [
      ['q0', 'q0', 95, 150],
      ['q1', 'q1', 250, 150],
      ['q2', 'q2', 172, 330],
    ],
    'q0',
    ['q2'],
    [
      ['q0', 'q0', '1'],
      ['q0', 'q1', '0'],
      ['q1', 'q1', '0'],
      ['q1', 'q2', '1'],
      ['q2', 'q2', '0'],
      ['q2', 'q2', '1'],
    ],
    'fa',
  ),

  // 4. no two consecutive ones
  'dfa-no-11': build(
    'sol4',
    [
      ['q0', 'q0', 95, 145],
      ['q1', 'q1', 250, 145],
      ['qd', 'qd', 172, 335],
    ],
    'q0',
    ['q0', 'q1'],
    [
      ['q0', 'q0', '0'],
      ['q0', 'q1', '1'],
      ['q1', 'q0', '0'],
      ['q1', 'qd', '1'],
      ['qd', 'qd', '0'],
      ['qd', 'qd', '1'],
    ],
    'fa',
  ),

  // 5. a* b*
  'nfa-a-then-b': build(
    'sol5',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 245, 230],
    ],
    'q0',
    ['q0', 'q1'],
    [
      ['q0', 'q0', 'a'],
      ['q0', 'q1', E],
      ['q1', 'q1', 'b'],
    ],
    'fa',
  ),

  // 6. a* b* c*
  'nfa-abc-blocks': build(
    'sol6',
    [
      ['q0', 'q0', 70, 230],
      ['q1', 'q1', 170, 230],
      ['q2', 'q2', 270, 230],
    ],
    'q0',
    ['q0', 'q1', 'q2'],
    [
      ['q0', 'q0', 'a'],
      ['q0', 'q1', E],
      ['q1', 'q1', 'b'],
      ['q1', 'q2', E],
      ['q2', 'q2', 'c'],
    ],
    'fa',
  ),

  // 7. third symbol from the end is a 1
  'nfa-third-last-1': build(
    'sol7',
    [
      ['q0', 'q0', 65, 200],
      ['q1', 'q1', 165, 120],
      ['q2', 'q2', 268, 210],
      ['q3', 'q3', 160, 335],
    ],
    'q0',
    ['q3'],
    [
      ['q0', 'q0', '0'],
      ['q0', 'q0', '1'],
      ['q0', 'q1', '1'],
      ['q1', 'q2', '0'],
      ['q1', 'q2', '1'],
      ['q2', 'q3', '0'],
      ['q2', 'q3', '1'],
    ],
    'fa',
  ),

  // 8. balanced brackets
  'pda-balanced': build(
    'sol8',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 250, 230],
    ],
    'q0',
    ['q1'],
    [
      ['q0', 'q0', '(', E, 'X'],
      ['q0', 'q0', ')', 'X', E],
      ['q0', 'q1', E, $, E],
    ],
    'pda',
  ),

  // 9. a^n b^n
  'pda-an-bn': build(
    'sol9',
    [
      ['q0', 'q0', 70, 230],
      ['q1', 'q1', 170, 230],
      ['q2', 'q2', 270, 230],
    ],
    'q0',
    ['q2'],
    [
      ['q0', 'q0', 'a', E, 'A'],
      ['q0', 'q1', E, E, E],
      ['q1', 'q1', 'b', 'A', E],
      ['q1', 'q2', E, $, E],
    ],
    'pda',
  ),

  // 10. even length palindromes
  'pda-palindrome': build(
    'sol10',
    [
      ['q0', 'q0', 70, 230],
      ['q1', 'q1', 170, 230],
      ['q2', 'q2', 270, 230],
    ],
    'q0',
    ['q2'],
    [
      ['q0', 'q0', 'a', E, 'A'],
      ['q0', 'q0', 'b', E, 'B'],
      ['q0', 'q1', E, E, E],
      ['q1', 'q1', 'a', 'A', E],
      ['q1', 'q1', 'b', 'B', E],
      ['q1', 'q2', E, $, E],
    ],
    'pda',
  ),

  // 5. binary value divisible by three: one state per remainder
  'dfa-div-by-three': build(
    'sol5',
    [
      ['q0', 'r0', 170, 96],
      ['q1', 'r1', 262, 268],
      ['q2', 'r2', 78, 268],
    ],
    'q0',
    ['q0'],
    [
      ['q0', 'q0', '0'],
      ['q0', 'q1', '1'],
      ['q1', 'q2', '0'],
      ['q1', 'q0', '1'],
      ['q2', 'q1', '0'],
      ['q2', 'q2', '1'],
    ],
    'fa',
  ),

  // 6. even zeros and even ones: the product of two parity machines
  'dfa-even-both': build(
    'sol6',
    [
      ['q0', 'ee', 96, 130],
      ['q1', 'oe', 244, 130],
      ['q2', 'eo', 96, 300],
      ['q3', 'oo', 244, 300],
    ],
    'q0',
    ['q0'],
    [
      ['q0', 'q1', '0'],
      ['q0', 'q2', '1'],
      ['q1', 'q0', '0'],
      ['q1', 'q3', '1'],
      ['q2', 'q3', '0'],
      ['q2', 'q0', '1'],
      ['q3', 'q2', '0'],
      ['q3', 'q1', '1'],
    ],
    'fa',
  ),

  // 7. begins and ends with the same symbol: commit, then track the last symbol
  'dfa-same-ends': build(
    'sol7',
    [
      ['q0', 'q0', 68, 230],
      ['q1', 'z0', 196, 118],
      ['q2', 'z1', 296, 118],
      ['q3', 'o1', 196, 344],
      ['q4', 'o0', 296, 344],
    ],
    'q0',
    ['q1', 'q3'],
    [
      ['q0', 'q1', '0'],
      ['q0', 'q3', '1'],
      ['q1', 'q1', '0'],
      ['q1', 'q2', '1'],
      ['q2', 'q1', '0'],
      ['q2', 'q2', '1'],
      ['q3', 'q4', '0'],
      ['q3', 'q3', '1'],
      ['q4', 'q4', '0'],
      ['q4', 'q3', '1'],
    ],
    'fa',
  ),

  // 10. ends with ab or ba: one loop, two guessed tails
  'nfa-ends-ab-or-ba': build(
    'sol10',
    [
      ['q0', 'q0', 78, 230],
      ['q1', 'q1', 186, 130],
      ['q2', 'q2', 186, 330],
      ['q3', 'q3', 288, 230],
    ],
    'q0',
    ['q3'],
    [
      ['q0', 'q0', 'a'],
      ['q0', 'q0', 'b'],
      ['q0', 'q1', 'a'],
      ['q0', 'q2', 'b'],
      ['q1', 'q3', 'b'],
      ['q2', 'q3', 'a'],
    ],
    'fa',
  ),

  // 12. length a multiple of two or of three: two loops behind one empty move
  'nfa-two-or-three': build(
    'sol12',
    [
      ['q0', 'q0', 60, 230],
      ['q1', 'e0', 170, 112],
      ['q2', 'e1', 288, 112],
      ['q3', 't0', 150, 330],
      ['q4', 't1', 248, 396],
      ['q5', 't2', 294, 306],
    ],
    'q0',
    ['q1', 'q3'],
    [
      ['q0', 'q1', E],
      ['q0', 'q3', E],
      ['q1', 'q2', 'a'],
      ['q2', 'q1', 'a'],
      ['q3', 'q4', 'a'],
      ['q4', 'q5', 'a'],
      ['q5', 'q3', 'a'],
    ],
    'fa',
  ),

  // 15. a^n b^2n: two marks pushed per a, one spent per b
  'pda-a-then-bb': build(
    'sol15',
    [
      ['q0', 'q0', 92, 130],
      ['q1', 'qp', 250, 130],
      ['q2', 'q1', 92, 300],
      ['q3', 'q2', 250, 300],
    ],
    'q0',
    ['q3'],
    [
      ['q0', 'q1', 'a', E, 'A'],
      ['q1', 'q0', E, E, 'A'],
      ['q0', 'q2', E, E, E],
      ['q2', 'q2', 'b', 'A', E],
      ['q2', 'q3', E, $, E],
    ],
    'pda',
  ),

  // 16. two kinds of bracket: one mark per kind, order kept by the stack
  'pda-two-brackets': build(
    'sol16',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 258, 230],
    ],
    'q0',
    ['q1'],
    [
      ['q0', 'q0', '(', E, 'P'],
      ['q0', 'q0', '[', E, 'Q'],
      ['q0', 'q0', ')', 'P', E],
      ['q0', 'q0', ']', 'Q', E],
      ['q0', 'q1', E, $, E],
    ],
    'pda',
  ),

  // 17. equally many a and b in any order: a counter that runs both ways
  'pda-equal-ab': build(
    'sol17',
    [
      ['q0', 'q0', 110, 230],
      ['q1', 'q1', 258, 230],
    ],
    'q0',
    ['q1'],
    [
      ['q0', 'q0', 'a', 'B', E],
      ['q0', 'q0', 'a', E, 'A'],
      ['q0', 'q0', 'b', 'A', E],
      ['q0', 'q0', 'b', E, 'B'],
      ['q0', 'q1', E, $, E],
    ],
    'pda',
  ),

  // 20. palindromes on a tape: cross off both ends and walk back
  'tm-palindrome': build(
    'sol20',
    [
      ['q0', 'q0', 78, 84],
      ['q1', 'qa1', 250, 84],
      ['q2', 'qa2', 250, 200],
      ['q3', 'qb1', 78, 316],
      ['q4', 'qb2', 250, 316],
      ['q5', 'qL', 78, 200],
      ['q6', 'qacc', 166, 416],
    ],
    'q0',
    ['q6'],
    [
      ['q0', 'q1', 'a', 'X', 'R'],
      ['q0', 'q3', 'b', 'X', 'R'],
      ['q0', 'q0', 'X', 'X', 'R'],
      ['q0', 'q6', B, B, 'R'],
      ['q1', 'q1', 'a', 'a', 'R'],
      ['q1', 'q1', 'b', 'b', 'R'],
      ['q1', 'q2', 'X', 'X', 'L'],
      ['q1', 'q2', B, B, 'L'],
      ['q2', 'q5', 'a', 'X', 'L'],
      ['q2', 'q6', 'X', 'X', 'R'],
      ['q3', 'q3', 'a', 'a', 'R'],
      ['q3', 'q3', 'b', 'b', 'R'],
      ['q3', 'q4', 'X', 'X', 'L'],
      ['q3', 'q4', B, B, 'L'],
      ['q4', 'q5', 'b', 'X', 'L'],
      ['q4', 'q6', 'X', 'X', 'R'],
      ['q5', 'q5', 'a', 'a', 'L'],
      ['q5', 'q5', 'b', 'b', 'L'],
      ['q5', 'q0', 'X', 'X', 'R'],
    ],
    'tm',
  ),

  // 19. a^n b^n on a tape
  'tm-an-bn': build(
    'sol11',
    [
      ['q0', 'q0', 80, 100],
      ['q1', 'q1', 252, 100],
      ['q2', 'q2', 252, 232],
      ['q3', 'q3', 80, 232],
      ['qa', 'qa', 166, 372],
    ],
    'q0',
    ['qa'],
    [
      ['q0', 'q1', 'a', 'X', 'R'],
      ['q0', 'q3', 'Y', 'Y', 'R'],
      ['q0', 'qa', B, B, 'R'],
      ['q1', 'q1', 'a', 'a', 'R'],
      ['q1', 'q1', 'Y', 'Y', 'R'],
      ['q1', 'q2', 'b', 'Y', 'L'],
      ['q2', 'q2', 'a', 'a', 'L'],
      ['q2', 'q2', 'Y', 'Y', 'L'],
      ['q2', 'q0', 'X', 'X', 'R'],
      ['q3', 'q3', 'Y', 'Y', 'R'],
      ['q3', 'qa', B, B, 'R'],
    ],
    'tm',
  ),

  // 21. a^n b^n c^n on a tape
  'tm-an-bn-cn': build(
    'sol12',
    [
      ['q0', 'q0', 86, 62],
      ['q1', 'q1', 254, 62],
      ['q2', 'q2', 254, 178],
      ['q3', 'q3', 86, 172],
      ['q4', 'q4', 86, 352],
      ['qa', 'qa', 258, 352],
    ],
    'q0',
    ['qa'],
    [
      ['q0', 'q1', 'a', 'X', 'R'],
      ['q0', 'q4', 'Y', 'Y', 'R'],
      ['q0', 'qa', B, B, 'R'],
      ['q1', 'q1', 'a', 'a', 'R'],
      ['q1', 'q1', 'Y', 'Y', 'R'],
      ['q1', 'q2', 'b', 'Y', 'R'],
      ['q2', 'q2', 'b', 'b', 'R'],
      ['q2', 'q2', 'Z', 'Z', 'R'],
      ['q2', 'q3', 'c', 'Z', 'L'],
      ['q3', 'q3', 'a', 'a', 'L'],
      ['q3', 'q3', 'b', 'b', 'L'],
      ['q3', 'q3', 'Y', 'Y', 'L'],
      ['q3', 'q3', 'Z', 'Z', 'L'],
      ['q3', 'q0', 'X', 'X', 'R'],
      ['q4', 'q4', 'Y', 'Y', 'R'],
      ['q4', 'q4', 'Z', 'Z', 'R'],
      ['q4', 'qa', B, B, 'R'],
    ],
    'tm',
  ),
};

/** Deep copy, so revealing a solution never hands the store a shared object. */
export const solutionFor = (levelId: string): Machine | undefined => {
  const m = SOLUTIONS[levelId];
  if (!m) return undefined;
  return {
    states: m.states.map((s) => ({ ...s })),
    transitions: m.transitions.map((t) => ({ ...t })),
    start: m.start,
    accepting: [...m.accepting],
  };
};
