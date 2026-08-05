/**
 * Section 10.4: state elimination.
 *
 * The expression is checked the same way everything else in this repo is: it
 * has to agree with the level's `accepts` predicate on every string over the
 * alphabet up to length 6.
 */

import { describe, expect, it } from 'vitest';

import { LEVELS, enumerateStrings } from '../src/engine/levels';
import { ringLayout, subsetConstruction } from '../src/engine/minimize';
import {
  alt,
  cat,
  machineToRegex,
  regexFor,
  render,
  star,
  toRegExpSource,
  type Rx,
} from '../src/engine/regex';
import { solutionFor } from '../src/engine/solutions';
import { EPSILON, type Machine } from '../src/engine/types';

const SYM = (s: string): Rx => ({ k: 'sym', s });
const EMPTY: Rx = { k: 'empty' };
const EPS: Rx = { k: 'eps' };

const asRegExp = (rx: Rx): RegExp => new RegExp(`^${toRegExpSource(rx)}$`);

describe('smart constructors keep the expression readable', () => {
  it('drops the empty language out of a union', () => {
    expect(alt(EMPTY, SYM('a'))).toEqual(SYM('a'));
    expect(alt(SYM('a'), EMPTY)).toEqual(SYM('a'));
  });

  it('collapses a union of identical branches', () => {
    expect(alt(SYM('a'), SYM('a'))).toEqual(SYM('a'));
    expect(alt(star(SYM('a')), star(SYM('a')))).toEqual(star(SYM('a')));
  });

  it('annihilates a concatenation with the empty language', () => {
    expect(cat(EMPTY, SYM('a'))).toEqual(EMPTY);
    expect(cat(SYM('a'), EMPTY)).toEqual(EMPTY);
  });

  it('drops epsilon out of a concatenation', () => {
    expect(cat(EPS, SYM('a'))).toEqual(SYM('a'));
    expect(cat(SYM('a'), EPS)).toEqual(SYM('a'));
  });

  it('flattens nested and trivial stars', () => {
    expect(star(EMPTY)).toEqual(EPS);
    expect(star(EPS)).toEqual(EPS);
    expect(star(star(SYM('a')))).toEqual(star(SYM('a')));
  });

  it('parenthesises only where precedence needs it', () => {
    expect(render(cat(SYM('a'), SYM('b')))).toBe('ab');
    expect(render(alt(SYM('a'), SYM('b')))).toBe('a|b');
    expect(render(cat(alt(SYM('a'), SYM('b')), SYM('c')))).toBe('(a|b)c');
    expect(render(star(alt(SYM('a'), SYM('b'))))).toBe('(a|b)*');
    expect(render(star(SYM('a')))).toBe('a*');
    expect(render(EPS)).toBe(EPSILON);
  });
});

const faLevels = LEVELS.filter((l) => l.type === 'DFA' || l.type === 'NFA');

describe.each(faLevels.map((l) => [l.id, l] as const))(
  'state elimination on %s',
  (_id, level) => {
    it('produces an expression for exactly the level language up to length 6', () => {
      const solution = solutionFor(level.id) as Machine;
      const rx = machineToRegex(solution);
      expect(rx).not.toBeNull();

      const re = asRegExp(rx as Rx);
      const mismatches: string[] = [];
      for (const w of enumerateStrings(level.alphabet, 6)) {
        if (re.test(w) !== level.accepts(w)) mismatches.push(w === '' ? 'ε' : w);
      }
      expect(mismatches.slice(0, 12), `regex ${render(rx as Rx)}`).toEqual([]);
    });

    it('renders without an empty language or a stray undefined', () => {
      const text = regexFor(solutionFor(level.id) as Machine) as string;
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('∅');
      expect(text.length).toBeGreaterThan(0);
    });
  },
);

describe('state elimination on machines the player might draw', () => {
  it('handles a machine that accepts nothing', () => {
    const m: Machine = {
      states: [{ id: 'q0', label: 'q0', x: 100, y: 200 }],
      start: 'q0',
      accepting: [],
      transitions: [{ id: 't', from: 'q0', to: 'q0', read: '0' }],
    };
    expect(regexFor(m)).toBe('∅');
  });

  it('handles a machine that accepts only the empty string', () => {
    const m: Machine = {
      states: [{ id: 'q0', label: 'q0', x: 100, y: 200 }],
      start: 'q0',
      accepting: ['q0'],
      transitions: [],
    };
    expect(regexFor(m)).toBe(EPSILON);
  });

  it('returns null when there is no start state', () => {
    expect(regexFor({ states: [], transitions: [], start: null, accepting: [] })).toBeNull();
  });

  it('agrees with the machine on 60 random NFAs', () => {
    let seed = 424242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const alphabet = ['0', '1'];
    const words = enumerateStrings(alphabet, 6);

    for (let trial = 0; trial < 60; trial++) {
      const n = 2 + Math.floor(rand() * 3);
      const points = ringLayout(n);
      const machine: Machine = {
        states: Array.from({ length: n }, (_, i) => ({
          id: `s${i}`,
          label: `s${i}`,
          x: (points[i] as { x: number; y: number }).x,
          y: (points[i] as { x: number; y: number }).y,
        })),
        transitions: [],
        start: 's0',
        accepting: [],
      };
      let tid = 0;
      for (let i = 0; i < n; i++) {
        for (const a of [...alphabet, EPSILON]) {
          if (rand() < 0.45) continue;
          machine.transitions.push({
            id: `t${tid++}`,
            from: `s${i}`,
            to: `s${Math.floor(rand() * n)}`,
            read: a,
          });
        }
      }
      machine.accepting = machine.states.filter(() => rand() < 0.4).map((s) => s.id);

      const rx = machineToRegex(machine);
      const re = asRegExp(rx as Rx);
      // The subset construction gives an independent answer for the same machine.
      const subset = subsetConstruction(machine, alphabet);
      const accepting = new Set((subset as NonNullable<typeof subset>).machine.accepting);
      const dfa = (subset as NonNullable<typeof subset>).machine;

      for (const w of words) {
        let state = dfa.start as string;
        let alive = true;
        for (const c of w) {
          const next = dfa.transitions.find((t) => t.from === state && t.read === c);
          if (!next) {
            alive = false;
            break;
          }
          state = next.to;
        }
        const viaSubset = alive && accepting.has(state);
        if (re.test(w) !== viaSubset) {
          throw new Error(
            `trial ${trial}: regex ${render(rx as Rx)} and the subset DFA disagree on ${
              w === '' ? 'ε' : w
            }`,
          );
        }
      }
    }
  });
});
