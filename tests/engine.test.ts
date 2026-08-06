/**
 * Section 9.1: engine and solutions.
 *
 * For every level, the verified solution is run against the level's fixed test
 * suite and against every string over its alphabet up to `exhaustiveMaxLength`,
 * and compared to the level's `accepts` predicate. Zero mismatches allowed.
 *
 * Everything here imports the engine only. No React, no React Native, no
 * simulator. `npx vitest run` is enough.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { LEVELS, enumerateStrings } from '../src/engine/levels';
import { minimise, ringLayout, subsetConstruction, withinCanvas } from '../src/engine/minimize';
import { run, runSuite, simulatePDA, simulateTM } from '../src/engine/simulate';
import { SOLUTIONS, solutionFor } from '../src/engine/solutions';
import { CANVAS, EPSILON, LIMITS, STACK_BOTTOM, BLANK } from '../src/engine/types';
import type { Level, Machine } from '../src/engine/types';
import { validate } from '../src/engine/validate';

// ---------------------------------------------------------------------------
// counters, reported at the end of the run
// ---------------------------------------------------------------------------

const tally = {
  levels: 0,
  suiteStrings: 0,
  exhaustiveStrings: 0,
  mismatches: 0,
};

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  9.1 engine and solutions',
      `    levels verified          ${tally.levels}`,
      `    fixed suite strings      ${tally.suiteStrings}`,
      `    exhaustive strings       ${tally.exhaustiveStrings}`,
      `    mismatches               ${tally.mismatches}`,
      '',
    ].join('\n'),
  );
});

const levelOf = (id: string): Level => LEVELS.find((l) => l.id === id) as Level;

// ---------------------------------------------------------------------------
// 9.1
// ---------------------------------------------------------------------------

describe('levels are well formed', () => {
  it('is indexed 1..n in order, with no gaps', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
    expect(LEVELS.map((l) => l.index)).toEqual(LEVELS.map((_l, i) => i + 1));
  });

  it('ids are unique', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('climbs the hierarchy: DFA, then NFA, then PDA, then TM', () => {
    // Asserted as an ordering rather than as a list, so adding a level does
    // not mean rewriting the assertion that the ordering is what matters.
    const rank = { DFA: 0, NFA: 1, PDA: 2, TM: 3 } as const;
    const ranks = LEVELS.map((l) => rank[l.type]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size, 'every class is represented').toBe(4);
  });

  it('every level has a solution and a non empty test suite', () => {
    for (const level of LEVELS) {
      expect(SOLUTIONS[level.id], `solution for ${level.id}`).toBeDefined();
      expect(level.tests.length, `tests for ${level.id}`).toBeGreaterThan(0);
    }
  });

  it('every test suite contains both accepted and rejected strings', () => {
    for (const level of LEVELS) {
      const accepted = level.tests.filter((w) => level.accepts(w));
      expect(accepted.length, `${level.id} accepts something`).toBeGreaterThan(0);
      expect(
        level.tests.length - accepted.length,
        `${level.id} rejects something`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * The checks below are what make a new level self authoring: get any of
   * these wrong and the suite says which one, rather than the game shipping a
   * level whose hint describes a machine nobody can build.
   */
  it('every level declares the alphabets its solution actually uses', () => {
    for (const level of LEVELS) {
      const solution = solutionFor(level.id) as Machine;
      for (const t of solution.transitions) {
        if (level.type === 'PDA') {
          const stack = new Set([...(level.stackAlphabet ?? []), EPSILON]);
          expect(stack.has(t.pop ?? EPSILON), `${level.id}: pop ${t.pop}`).toBe(true);
          expect(stack.has(t.push ?? EPSILON), `${level.id}: push ${t.push}`).toBe(true);
        }
        if (level.type === 'TM') {
          const tape = new Set(level.tapeAlphabet ?? []);
          expect(tape.has(t.read), `${level.id}: reads ${t.read}`).toBe(true);
          expect(tape.has(t.write ?? t.read), `${level.id}: writes ${t.write}`).toBe(true);
        }
      }
    }
  });

  it('never asks a machine for a language its class cannot recognise', () => {
    // Chomsky numbers run the other way to power: 3 is regular, 0 is every
    // machine there is. So a level's type is a floor on the number, not a
    // ceiling. A PDA level may hold a regular language, and level 20 holds a
    // context free one on a tape; what none of them may do is claim a class
    // their machine cannot recognise.
    const weakest = { DFA: 3, NFA: 3, PDA: 2, TM: 0 } as const;
    for (const level of LEVELS) {
      expect(level.chomsky, `${level.id} is a ${level.type}`).toBeGreaterThanOrEqual(
        weakest[level.type],
      );
    }
  });

  it('every test string is over the level alphabet', () => {
    for (const level of LEVELS) {
      const sigma = new Set(level.alphabet);
      for (const w of level.tests) {
        for (const c of w) {
          expect(sigma.has(c), `${level.id}: ${c} in ${w}`).toBe(true);
        }
      }
    }
  });
});

describe.each(LEVELS.map((l) => [l.index, l.id, l] as const))(
  'level %i %s',
  (_index, _id, level) => {
    const solution = solutionFor(level.id) as Machine;

    it('is a well formed machine of its class', () => {
      const report = validate(solution, level);
      expect(report.errors).toEqual([]);
    });

    it('has exactly par states', () => {
      expect(solution.states.length).toBe(level.par);
    });

    it('lays every state out inside the canvas', () => {
      expect(withinCanvas(solution)).toBe(true);
      for (const s of solution.states) {
        expect(s.x).toBeGreaterThanOrEqual(CANVAS.stateRadius);
        expect(s.x).toBeLessThanOrEqual(CANVAS.width - CANVAS.stateRadius);
        expect(s.y).toBeGreaterThanOrEqual(CANVAS.stateRadius);
        expect(s.y).toBeLessThanOrEqual(CANVAS.height - CANVAS.stateRadius);
      }
    });

    it('passes its own fixed test suite', () => {
      const result = runSuite(solution, level);
      const failures = result.rows.filter((r) => !r.pass);
      tally.suiteStrings += result.rows.length;
      tally.mismatches += failures.length;
      expect(
        failures.map((f) => `${JSON.stringify(f.input)} expected ${f.expected} got ${f.actual}`),
      ).toEqual([]);
      expect(result.solved).toBe(true);
    });

    it(`agrees with the language on every string up to length ${level.exhaustiveMaxLength}`, () => {
      const words = enumerateStrings(level.alphabet, level.exhaustiveMaxLength);
      const mismatches: string[] = [];
      for (const w of words) {
        const result = run(solution, level, w);
        if (result.error) {
          mismatches.push(`${JSON.stringify(w)} errored: ${result.error}`);
          continue;
        }
        if (result.outcome === 'nonhalting') {
          mismatches.push(`${JSON.stringify(w)} hit a simulation cap`);
          continue;
        }
        const expected = level.accepts(w);
        if (result.accepted !== expected) {
          mismatches.push(`${JSON.stringify(w)} expected ${expected} got ${result.accepted}`);
        }
      }
      tally.levels += 1;
      tally.exhaustiveStrings += words.length;
      tally.mismatches += mismatches.length;
      expect(mismatches.slice(0, 12)).toEqual([]);
    });
  },
);

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

describe('validation', () => {
  const twoArrowsOnZero: Machine = {
    states: [
      { id: 'q0', label: 'q0', x: 100, y: 200 },
      { id: 'q1', label: 'q1', x: 240, y: 200 },
    ],
    start: 'q0',
    accepting: ['q1'],
    transitions: [
      { id: 't0', from: 'q0', to: 'q0', read: '0' },
      { id: 't1', from: 'q0', to: 'q1', read: '0' },
      { id: 't2', from: 'q0', to: 'q1', read: '1' },
      { id: 't3', from: 'q1', to: 'q1', read: '0' },
      { id: 't4', from: 'q1', to: 'q1', read: '1' },
    ],
  };

  it('a DFA with two arrows on one symbol reports an error rather than simulating', () => {
    const level = levelOf('dfa-ends-in-1');
    const report = validate(twoArrowsOnZero, level);
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.message).toMatch(/only one/i);
    expect(report.errors[0]?.transitionIds).toEqual(['t0', 't1']);

    const result = run(twoArrowsOnZero, level, '01');
    expect(result.outcome).toBe('error');
    expect(result.frames).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('an NFA with the same shape does not', () => {
    const level = levelOf('nfa-third-last-1');
    const report = validate(twoArrowsOnZero, level);
    expect(report.errors).toEqual([]);

    const result = run(twoArrowsOnZero, level, '01');
    expect(result.outcome).not.toBe('error');
    expect(result.frames.length).toBeGreaterThan(0);
  });

  it('a DFA with an empty move reports an error', () => {
    const level = levelOf('dfa-ends-in-1');
    const withEpsilon: Machine = {
      ...twoArrowsOnZero,
      transitions: [
        { id: 't0', from: 'q0', to: 'q1', read: '0' },
        { id: 't1', from: 'q0', to: 'q1', read: EPSILON },
      ],
    };
    const report = validate(withEpsilon, level);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => /empty moves/i.test(e.message))).toBe(true);
  });

  it('a partial DFA is legal, behaves as a dead state, and the gap count is surfaced', () => {
    const level = levelOf('dfa-ends-in-1');
    const partial: Machine = {
      states: [{ id: 'q0', label: 'q0', x: 100, y: 200 }],
      start: 'q0',
      accepting: ['q0'],
      transitions: [{ id: 't0', from: 'q0', to: 'q0', read: '1' }],
    };
    const report = validate(partial, level);
    expect(report.ok).toBe(true);
    expect(report.total).toBe(false);
    expect(report.missingPairs).toEqual([{ state: 'q0', symbol: '0' }]);

    const result = run(partial, level, '10');
    expect(result.accepted).toBe(false);
    expect(result.outcome).toBe('reject');
    expect(result.note).toMatch(/no arrow on 0/i);
  });

  it('a TM with two rules on one read symbol reports an error', () => {
    const level = levelOf('tm-an-bn');
    const machine: Machine = {
      states: [{ id: 'q0', label: 'q0', x: 100, y: 200 }],
      start: 'q0',
      accepting: [],
      transitions: [
        { id: 't0', from: 'q0', to: 'q0', read: 'a', write: 'a', move: 'R' },
        { id: 't1', from: 'q0', to: 'q0', read: 'a', write: 'b', move: 'L' },
      ],
    };
    expect(validate(machine, level).ok).toBe(false);
    expect(run(machine, level, 'a').outcome).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// caps
// ---------------------------------------------------------------------------

describe('simulation caps', () => {
  it('a TM that never halts reports a non halting run, distinct from a rejection', () => {
    const level = levelOf('tm-an-bn');
    const runaway: Machine = {
      states: [
        { id: 'q0', label: 'q0', x: 100, y: 200 },
        { id: 'qa', label: 'qa', x: 240, y: 200 },
      ],
      start: 'q0',
      accepting: ['qa'],
      transitions: [
        { id: 't0', from: 'q0', to: 'q0', read: 'a', write: 'a', move: 'R' },
        { id: 't1', from: 'q0', to: 'q0', read: BLANK, write: BLANK, move: 'R' },
      ],
    };
    const started = Date.now();
    const result = simulateTM(runaway, level, 'aa');
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.outcome).toBe('nonhalting');
    expect(result.accepted).toBe(false);
    expect(result.note).toMatch(/has not halted/i);
    expect(result.frames.length).toBeLessThanOrEqual(LIMITS.frames);
  });

  it('a PDA that pushes forever stops at the stack height cap', () => {
    const level = levelOf('pda-balanced');
    const pusher: Machine = {
      states: [
        { id: 'q0', label: 'q0', x: 100, y: 200 },
        { id: 'q1', label: 'q1', x: 240, y: 200 },
      ],
      start: 'q0',
      accepting: ['q1'],
      transitions: [{ id: 't0', from: 'q0', to: 'q0', read: EPSILON, pop: EPSILON, push: 'X' }],
    };
    const result = simulatePDA(pusher, level, '()');
    expect(result.accepted).toBe(false);
    expect(result.outcome).toBe('reject');
    expect(result.note).toMatch(/stack height cap of 16/);
  });

  it('a PDA with an exploding configuration space stops at the configuration cap', () => {
    const level = { ...levelOf('pda-balanced'), stackAlphabet: [STACK_BOTTOM, 'X', 'Y'] };
    const brancher: Machine = {
      states: [
        { id: 'q0', label: 'q0', x: 100, y: 200 },
        { id: 'q1', label: 'q1', x: 240, y: 200 },
      ],
      start: 'q0',
      accepting: ['q1'],
      transitions: [
        { id: 't0', from: 'q0', to: 'q0', read: EPSILON, pop: EPSILON, push: 'X' },
        { id: 't1', from: 'q0', to: 'q0', read: EPSILON, pop: EPSILON, push: 'Y' },
      ],
    };
    const started = Date.now();
    const result = simulatePDA(brancher, level, '(((((((((())))))))))'.slice(0, 20));
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.outcome).toBe('nonhalting');
    expect(result.note).toMatch(/configurations/);
  });
});

// ---------------------------------------------------------------------------
// minimisation
// ---------------------------------------------------------------------------

describe('minimisation', () => {
  const dfaLevels = LEVELS.filter((l) => l.type === 'DFA');

  it.each(dfaLevels.map((l) => [l.id, l] as const))(
    'Hopcroft on the reference solution for %s returns par, so par really is minimal',
    (_id, level) => {
      const solution = solutionFor(level.id) as Machine;
      const result = minimise(solution, level.alphabet);
      expect(result).not.toBeNull();
      expect(result?.minimalStates).toBe(level.par);
      expect(result?.minimal).toBe(true);
      expect(result?.excess).toBe(0);
    },
  );

  it('reports how many states a padded machine wastes', () => {
    const level = levelOf('dfa-ends-in-1');
    // Same language, but the accepting state is split in two.
    const padded: Machine = {
      states: [
        { id: 'q0', label: 'q0', x: 80, y: 200 },
        { id: 'q1', label: 'q1', x: 170, y: 120 },
        { id: 'q2', label: 'q2', x: 260, y: 200 },
      ],
      start: 'q0',
      accepting: ['q1', 'q2'],
      transitions: [
        { id: 'a', from: 'q0', to: 'q0', read: '0' },
        { id: 'b', from: 'q0', to: 'q1', read: '1' },
        { id: 'c', from: 'q1', to: 'q0', read: '0' },
        { id: 'd', from: 'q1', to: 'q2', read: '1' },
        { id: 'e', from: 'q2', to: 'q0', read: '0' },
        { id: 'f', from: 'q2', to: 'q1', read: '1' },
      ],
    };
    const result = minimise(padded, level.alphabet);
    expect(result?.minimalStates).toBe(2);
    expect(result?.minimal).toBe(false);
    expect(result?.excess).toBe(1);
    expect(result?.mergeable[0]?.sort()).toEqual(['q1', 'q2']);
  });

  it('drops unreachable states before minimising', () => {
    const level = levelOf('dfa-ends-in-1');
    const solution = solutionFor(level.id) as Machine;
    const orphaned: Machine = {
      ...solution,
      states: [...solution.states, { id: 'ghost', label: 'ghost', x: 60, y: 400 }],
    };
    const result = minimise(orphaned, level.alphabet);
    expect(result?.unreachable).toEqual(['ghost']);
    expect(result?.minimalStates).toBe(2);
  });

  it('minimises the completed machine, so a partial DFA is not punished for its implicit sink', () => {
    const level = levelOf('dfa-no-11');
    // The par 3 solution written with the dead state left implicit.
    const partial: Machine = {
      states: [
        { id: 'q0', label: 'q0', x: 110, y: 200 },
        { id: 'q1', label: 'q1', x: 240, y: 200 },
      ],
      start: 'q0',
      accepting: ['q0', 'q1'],
      transitions: [
        { id: 'a', from: 'q0', to: 'q0', read: '0' },
        { id: 'b', from: 'q0', to: 'q1', read: '1' },
        { id: 'c', from: 'q1', to: 'q0', read: '0' },
      ],
    };
    const result = minimise(partial, level.alphabet);
    expect(result?.sinkAdded).toBe(true);
    expect(result?.minimalStates).toBe(3);
    expect(result?.minimal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// subset construction, property test
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so a failing case is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNfa(rand: () => number, alphabet: string[]): Machine {
  const n = 2 + Math.floor(rand() * 3);
  const points = ringLayout(n);
  const states = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    label: `s${i}`,
    x: (points[i] as { x: number; y: number }).x,
    y: (points[i] as { x: number; y: number }).y,
  }));
  const symbols = [...alphabet, EPSILON];
  const transitions = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    for (const a of symbols) {
      // Roughly one arrow per state and symbol, sometimes two, sometimes none.
      const arrows = rand() < 0.25 ? 0 : rand() < 0.75 ? 1 : 2;
      for (let k = 0; k < arrows; k++) {
        transitions.push({
          id: `r${id++}`,
          from: `s${i}`,
          to: `s${Math.floor(rand() * n)}`,
          read: a,
        });
      }
    }
  }
  const accepting = states.filter(() => rand() < 0.4).map((s) => s.id);
  return { states, transitions, start: 's0', accepting };
}

describe('subset construction', () => {
  const alphabet = ['0', '1'];
  const nfaLevel = { ...levelOf('nfa-third-last-1'), alphabet } as Level;
  const dfaLevel = { ...levelOf('dfa-ends-in-1'), alphabet } as Level;
  const words = enumerateStrings(alphabet, 6);

  it('determinises 200 random NFAs into DFAs accepting the same strings up to length 6', () => {
    const rand = mulberry32(20260805);
    let checked = 0;
    for (let trial = 0; trial < 200; trial++) {
      const nfa = randomNfa(rand, alphabet);
      const subset = subsetConstruction(nfa, alphabet);
      expect(subset, `trial ${trial}`).not.toBeNull();
      const dfa = (subset as NonNullable<typeof subset>).machine;

      expect(validate(dfa, dfaLevel).errors, `trial ${trial} produced a valid DFA`).toEqual([]);

      for (const w of words) {
        const a = run(nfa, nfaLevel, w).accepted;
        const b = run(dfa, dfaLevel, w).accepted;
        if (a !== b) {
          throw new Error(`trial ${trial}: NFA and its subset DFA disagree on ${JSON.stringify(w)}`);
        }
        checked++;
      }
    }
    expect(checked).toBe(200 * words.length);
  });

  it('determinises the level 7 solution into the eight state DFA the theory predicts', () => {
    const solution = solutionFor('nfa-third-last-1') as Machine;
    const subset = subsetConstruction(solution, ['0', '1']);
    expect(subset).not.toBeNull();
    const dfa = (subset as NonNullable<typeof subset>).machine;
    const minimised = minimise(dfa, ['0', '1']);
    expect(minimised?.minimalStates).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// trace frames
// ---------------------------------------------------------------------------

describe('trace frames', () => {
  it('a DFA run produces one frame per symbol plus the start frame', () => {
    const level = levelOf('dfa-ends-in-1');
    const result = run(solutionFor(level.id) as Machine, level, '0101');
    expect(result.frames).toHaveLength(5);
    expect(result.frames[0]?.pos).toBe(0);
    expect(result.frames[4]?.pos).toBe(4);
  });

  it('a PDA run carries the stack, bottom marker first', () => {
    const level = levelOf('pda-an-bn');
    const result = run(solutionFor(level.id) as Machine, level, 'aabb');
    expect(result.accepted).toBe(true);
    expect(result.frames[0]?.stack).toEqual([STACK_BOTTOM]);
    const deepest = result.frames.reduce(
      (max, f) => Math.max(max, f.stack?.length ?? 0),
      0,
    );
    expect(deepest).toBe(3);
    expect(result.frames[result.frames.length - 1]?.stack).toEqual([]);
  });

  it('a TM run carries the tape and the head index', () => {
    const level = levelOf('tm-an-bn');
    const result = run(solutionFor(level.id) as Machine, level, 'ab');
    expect(result.accepted).toBe(true);
    const first = result.frames[0];
    expect(first?.tape?.join('')).toContain('ab');
    expect(first?.head).toBe(1);
    expect(first?.tapeOffset).toBe(-1);
    const last = result.frames[result.frames.length - 1];
    expect(last?.tape?.join('')).toContain('XY');
  });

  it('never stores more than the frame cap, however long the run', () => {
    const level = levelOf('tm-an-bn-cn');
    const long = 'a'.repeat(12) + 'b'.repeat(12) + 'c'.repeat(12);
    const result = run(solutionFor(level.id) as Machine, level, long);
    expect(result.accepted).toBe(true);
    expect(result.frames.length).toBeLessThanOrEqual(LIMITS.frames);
  });
});
