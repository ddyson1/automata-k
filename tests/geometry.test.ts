/**
 * Arrow geometry, section 8.
 *
 * These are the details the prototype learned the hard way, so they get held in
 * place by tests rather than by eye: heads land on the target circle with
 * clearance, parallel edges separate, self loops aim away from other
 * connections, and multiple transitions stack as separate chips.
 */

import { describe, expect, it } from 'vitest';

import { CANVAS } from '../src/engine/types';
import {
  ARROW_CLEARANCE,
  BEND_DEFAULT,
  BEND_PARALLEL,
  buildEdges,
  CANVAS_H,
  CANVAS_W,
  chipAnchor,
  edgeGeometry,
  edgesPathData,
  STATE_RADIUS,
  type EdgeSpec,
  type Positions,
} from '../src/ui/geometry';

/** First point of the arrow triangle path is its tip. */
const tipOf = (arrow: string): { x: number; y: number } => {
  const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(arrow);
  if (!m) throw new Error(`no tip in ${arrow}`);
  return { x: Number(m[1]), y: Number(m[2]) };
};

const lastPointOf = (path: string): { x: number; y: number } => {
  const points = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)];
  const last = points[points.length - 1];
  if (!last) throw new Error(`no points in ${path}`);
  return { x: Number(last[1]), y: Number(last[2]) };
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const edge = (over: Partial<EdgeSpec> = {}): EdgeSpec => ({
  key: 'a->b',
  from: 'a',
  to: 'b',
  selfLoop: false,
  bend: BEND_DEFAULT,
  neighbours: [],
  transitionIds: ['t0'],
  chips: ['0'],
  ...over,
});

describe('the logical canvas is one number', () => {
  it('geometry mirrors the engine constants', () => {
    expect(CANVAS_W).toBe(CANVAS.width);
    expect(CANVAS_H).toBe(CANVAS.height);
    expect(STATE_RADIUS).toBe(CANVAS.stateRadius);
  });
});

describe('arrow heads', () => {
  const positions: Positions = { a: { x: 80, y: 200 }, b: { x: 260, y: 200 } };

  it('land on the target circle with about 3px of clearance', () => {
    const g = edgeGeometry(edge(), positions);
    expect(dist(tipOf(g.arrow), positions.b as { x: number; y: number })).toBeCloseTo(
      STATE_RADIUS + ARROW_CLEARANCE,
      1,
    );
  });

  it('keep their clearance whatever the bend', () => {
    for (const bend of [0, 8, BEND_DEFAULT, BEND_PARALLEL, -BEND_PARALLEL, 90]) {
      const g = edgeGeometry(edge({ bend }), positions);
      expect(
        dist(tipOf(g.arrow), positions.b as { x: number; y: number }),
        `bend ${bend}`,
      ).toBeCloseTo(STATE_RADIUS + ARROW_CLEARANCE, 1);
    }
  });

  it('keep their clearance whatever the distance and angle', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 7) {
      for (const d of [90, 140, 300]) {
        const at: Positions = {
          a: { x: 170, y: 230 },
          b: { x: 170 + Math.cos(angle) * d, y: 230 + Math.sin(angle) * d },
        };
        const g = edgeGeometry(edge(), at);
        expect(dist(tipOf(g.arrow), at.b as { x: number; y: number })).toBeCloseTo(
          STATE_RADIUS + ARROW_CLEARANCE,
          1,
        );
      }
    }
  });

  it('the stroke stops short of the tip, so nothing pokes through the head', () => {
    const g = edgeGeometry(edge(), positions);
    const strokeEnd = lastPointOf(g.path);
    const tip = tipOf(g.arrow);
    expect(dist(strokeEnd, tip)).toBeGreaterThan(6);
    expect(dist(strokeEnd, positions.b as { x: number; y: number })).toBeGreaterThan(
      STATE_RADIUS + ARROW_CLEARANCE,
    );
  });

  it('the stroke starts on the source rim', () => {
    const g = edgeGeometry(edge(), positions);
    const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(g.path);
    const start = { x: Number(m?.[1]), y: Number(m?.[2]) };
    expect(dist(start, positions.a as { x: number; y: number })).toBeCloseTo(STATE_RADIUS, 1);
  });

  it('gives up rather than drawing garbage when two states overlap', () => {
    const g = edgeGeometry(edge(), { a: { x: 170, y: 230 }, b: { x: 178, y: 230 } });
    expect(g.path).toBe('');
    expect(g.arrow).toBe('');
  });

  it('draws no markers: the head is a closed filled triangle', () => {
    const g = edgeGeometry(edge(), positions);
    expect(g.arrow.endsWith('Z')).toBe(true);
    expect(g.arrow.split('L')).toHaveLength(3);
    expect(g.path).not.toContain('marker');
  });
});

describe('parallel edges separate', () => {
  it('a reverse edge widens the bend on both', () => {
    const edges = buildEdges([
      { id: 't0', from: 'a', to: 'b', chip: '0' },
      { id: 't1', from: 'b', to: 'a', chip: '1' },
    ]);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.bend === BEND_PARALLEL)).toBe(true);
  });

  it('a lone edge keeps the slight default bend, and is not straight', () => {
    const edges = buildEdges([{ id: 't0', from: 'a', to: 'b', chip: '0' }]);
    expect(edges[0]?.bend).toBe(BEND_DEFAULT);
    expect(BEND_DEFAULT).toBeGreaterThan(0);
  });

  it('the two directions bow to opposite sides', () => {
    const positions: Positions = { a: { x: 80, y: 230 }, b: { x: 260, y: 230 } };
    const [ab, ba] = buildEdges([
      { id: 't0', from: 'a', to: 'b', chip: '0' },
      { id: 't1', from: 'b', to: 'a', chip: '1' },
    ]);
    const one = edgeGeometry(ab as EdgeSpec, positions);
    const two = edgeGeometry(ba as EdgeSpec, positions);
    // One anchor above the line between the states, one below.
    expect(Math.sign(one.anchor.y - 230)).toBe(-Math.sign(two.anchor.y - 230));
  });
});

describe('self loops', () => {
  it('aim away from the average direction of the other connections', () => {
    // b sits to the right of a, so a's loop should point left.
    const positions: Positions = { a: { x: 170, y: 230 }, b: { x: 280, y: 230 } };
    const loop = edge({ key: 'a->a', to: 'a', selfLoop: true, neighbours: ['b'] });
    const g = edgeGeometry(loop, positions);
    expect(g.normal.x).toBeLessThan(-0.7);
  });

  it('aim up when the state has no other connections', () => {
    const g = edgeGeometry(
      edge({ key: 'a->a', to: 'a', selfLoop: true, neighbours: [] }),
      { a: { x: 170, y: 230 } },
    );
    expect(g.normal.y).toBeLessThan(-0.7);
  });

  it('aim back inward when the state sits against a canvas edge', () => {
    // Neighbour to the right would push the loop left, off the canvas.
    const positions: Positions = { a: { x: 34, y: 230 }, b: { x: 200, y: 230 } };
    const g = edgeGeometry(
      edge({ key: 'a->a', to: 'a', selfLoop: true, neighbours: ['b'] }),
      positions,
    );
    expect(g.normal.x).toBeGreaterThan(0);
  });

  it('keep the head on the rim with clearance, like any other edge', () => {
    const positions: Positions = { a: { x: 170, y: 230 } };
    const g = edgeGeometry(edge({ key: 'a->a', to: 'a', selfLoop: true }), positions);
    expect(dist(tipOf(g.arrow), positions.a as { x: number; y: number })).toBeCloseTo(
      STATE_RADIUS + ARROW_CLEARANCE,
      1,
    );
  });
});

describe('chips', () => {
  it('several transitions on one pair become one edge with several chips', () => {
    const edges = buildEdges([
      { id: 't0', from: 'a', to: 'b', chip: '0' },
      { id: 't1', from: 'a', to: 'b', chip: '1' },
      { id: 't2', from: 'a', to: 'b', chip: 'ε' },
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.chips).toEqual(['0', '1', 'ε']);
    expect(edges[0]?.transitionIds).toEqual(['t0', 't1', 't2']);
  });

  it('a taller stack hangs further off the curve, so it never covers it', () => {
    const positions: Positions = { a: { x: 80, y: 230 }, b: { x: 260, y: 230 } };
    const one = chipAnchor(edge({ chips: ['0'] }), positions);
    const three = chipAnchor(edge({ chips: ['0', '1', 'ε'] }), positions);
    const mid = edgeGeometry(edge(), positions).anchor;
    expect(Math.abs(three.y - mid.y)).toBeGreaterThan(Math.abs(one.y - mid.y));
  });

  it('a self loop chip stack stays inside the canvas for every rim position', () => {
    const spots = [
      { x: 34, y: 34 },
      { x: 306, y: 34 },
      { x: 34, y: 426 },
      { x: 306, y: 426 },
      { x: 170, y: 34 },
      { x: 34, y: 230 },
    ];
    for (const at of spots) {
      const positions: Positions = { a: at, b: { x: 170, y: 230 } };
      const anchor = chipAnchor(
        edge({ key: 'a->a', to: 'a', selfLoop: true, neighbours: ['b'], chips: ['a → X, R'] }),
        positions,
      );
      expect(anchor.x, `x at ${at.x},${at.y}`).toBeGreaterThan(-10);
      expect(anchor.x, `x at ${at.x},${at.y}`).toBeLessThan(CANVAS_W + 10);
      expect(anchor.y, `y at ${at.x},${at.y}`).toBeGreaterThan(-10);
      expect(anchor.y, `y at ${at.x},${at.y}`).toBeLessThan(CANVAS_H + 10);
    }
  });
});

describe('batching', () => {
  it('concatenates every edge into one stroke path and one head path', () => {
    const positions: Positions = {
      a: { x: 80, y: 120 },
      b: { x: 260, y: 120 },
      c: { x: 170, y: 340 },
    };
    const edges = buildEdges([
      { id: 't0', from: 'a', to: 'b', chip: '0' },
      { id: 't1', from: 'b', to: 'c', chip: '1' },
      { id: 't2', from: 'c', to: 'c', chip: '0' },
    ]);
    const { strokes, heads } = edgesPathData(edges, positions);
    expect(strokes.match(/M/g)).toHaveLength(3);
    expect(heads.match(/Z/g)).toHaveLength(3);
  });

  it('skips edges whose endpoints have gone away mid drag', () => {
    const edges = buildEdges([{ id: 't0', from: 'a', to: 'ghost', chip: '0' }]);
    const { strokes, heads } = edgesPathData(edges, { a: { x: 80, y: 120 } });
    expect(strokes).toBe('');
    expect(heads).toBe('');
  });
});
