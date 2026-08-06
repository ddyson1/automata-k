/**
 * Tidy has one job it was failing at: leaving the states where you can see all
 * of them.
 *
 * The ring it used put three states of radius 28 on a circle of radius 36,
 * which leaves their rims six units apart. The circles clear each other, so a
 * rim-to-rim check would have passed it. What does not clear is the self loop:
 * it reaches LOOP_REACH radii out from its own centre, further than the gap,
 * so on that ring every loop was drawn through the state beside it. That is
 * the threshold measured here, and it is read from the drawing code rather
 * than picked, so the two cannot drift apart.
 *
 * The rest of the file is about the layout being a reading of the graph rather
 * than of the coordinates: a chain in a row, in the order it runs, and the
 * same picture however many times the button is pressed.
 */

import { describe, expect, it } from 'vitest';

import { layoutMachine } from '../src/engine/layout';
import { LEVELS } from '../src/engine/levels';
import { solutionFor } from '../src/engine/solutions';
import { minimise, subsetConstruction } from '../src/engine/minimize';
import { LOOP_REACH } from '../src/ui/geometry';
import { CANVAS, type Machine } from '../src/engine/types';

const R = CANVAS.stateRadius;

/** A state carrying a self loop takes up this much room, not one radius. */
const NEEDED = LOOP_REACH * R + R;

const laidOutMachine = (m: Machine): Machine => {
  const points = layoutMachine(m);
  return { ...m, states: m.states.map((s, i) => ({ ...s, ...(points[i] as object) })) };
};

/** How much further apart the closest pair would have to be. Negative is fine. */
function crowding(m: Machine): number {
  let worst = -Infinity;
  for (let i = 0; i < m.states.length; i++) {
    for (let j = i + 1; j < m.states.length; j++) {
      const a = m.states[i] as { x: number; y: number };
      const b = m.states[j] as { x: number; y: number };
      worst = Math.max(worst, NEEDED - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return worst;
}

const chain = (n: number): Machine => ({
  states: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, label: `q${i}`, x: 0, y: 0 })),
  transitions: Array.from({ length: n - 1 }, (_, i) => ({
    id: `t${i}`,
    from: `q${i}`,
    to: `q${i + 1}`,
    read: 'a',
  })),
  start: 'q0',
  accepting: [`q${n - 1}`],
});

describe('tidy', () => {
  it('leaves room for a self loop between any two states, at any size', () => {
    for (let n = 2; n <= 12; n++) {
      const m = laidOutMachine(chain(n));
      expect(crowding(m), `a chain of ${n}`).toBeLessThanOrEqual(0);
    }
  });

  it('leaves room for a self loop in every level solution', () => {
    for (const level of LEVELS) {
      const solution = solutionFor(level.id);
      if (!solution) continue;
      const m = laidOutMachine(solution);
      expect(crowding(m), `${level.id} has ${m.states.length} states`).toBeLessThanOrEqual(0);
    }
  });

  it('leaves room between states nothing connects', () => {
    for (let n = 2; n <= 12; n++) {
      const m = laidOutMachine({
        states: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, label: `q${i}`, x: 0, y: 0 })),
        transitions: [],
        start: null,
        accepting: [],
      });
      expect(crowding(m), `${n} loose states`).toBeLessThanOrEqual(0);
    }
  });

  it('lays a chain out as a row, in the order it runs', () => {
    const m = laidOutMachine(chain(5));
    const ys = m.states.map((s) => s.y);
    expect(new Set(ys).size, 'every state on one line').toBe(1);
    const xs = m.states.map((s) => s.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('opens a fork symmetrically about the line the start sits on', () => {
    const m = laidOutMachine({
      states: ['q0', 'q1', 'q2'].map((id) => ({ id, label: id, x: 0, y: 0 })),
      transitions: [
        { id: 't0', from: 'q0', to: 'q1', read: 'a' },
        { id: 't1', from: 'q0', to: 'q2', read: 'b' },
      ],
      start: 'q0',
      accepting: [],
    });
    const at = (id: string): { x: number; y: number } =>
      m.states.find((s) => s.id === id) as { x: number; y: number };
    expect(at('q1').x, 'both branches in the same column').toBe(at('q2').x);
    expect(at('q1').y + at('q2').y, 'symmetric about the start').toBe(2 * at('q0').y);
  });

  it('is idempotent: it reads the graph, never the coordinates', () => {
    const once = laidOutMachine(solutionFor('dfa-contains-01') as Machine);
    const twice = laidOutMachine(once);
    expect(twice.states).toEqual(once.states);
  });

  it('puts the start state leftmost', () => {
    for (const level of LEVELS) {
      const solution = solutionFor(level.id);
      if (!solution || solution.start === null) continue;
      const m = laidOutMachine(solution);
      const start = m.states.find((s) => s.id === m.start) as { x: number };
      const leftmost = Math.min(...m.states.map((s) => s.x));
      expect(start.x, level.id).toBe(leftmost);
    }
  });

  it('lays out the machines the analysis tab hands to the canvas', () => {
    const level = LEVELS.find((l) => l.id === 'dfa-contains-01');
    const solution = solutionFor('dfa-contains-01') as Machine;
    const min = minimise(solution, (level as { alphabet: string[] }).alphabet);
    expect(min).not.toBeNull();
    expect(crowding((min as { machine: Machine }).machine)).toBeLessThanOrEqual(0);

    const nfa = solutionFor('nfa-third-last-1') as Machine;
    const nfaLevel = LEVELS.find((l) => l.id === 'nfa-third-last-1') as { alphabet: string[] };
    const subset = subsetConstruction(nfa, nfaLevel.alphabet);
    expect(subset).not.toBeNull();
    expect(crowding((subset as { machine: Machine }).machine)).toBeLessThanOrEqual(0);
  });
});
