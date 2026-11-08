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
import { transitionChip } from '../src/engine/formal';
import { LEVELS } from '../src/engine/levels';
import { solutionFor } from '../src/engine/solutions';
import {
  ARROW_CLEARANCE,
  BEND_DEFAULT,
  BEND_PARALLEL,
  buildEdges,
  CANVAS_H,
  CANVAS_W,
  CHIP_CHAR_W,
  CHIP_PAD_X,
  CHIP_ROW_HEIGHT,
  chipAnchor,
  chipAnchors,
  chipStackSize,
  edgeGeometry,
  edgesPathData,
  START_ENTRY_LEN,
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
  startMarker: false,
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

  it('the stroke ends exactly at the head, whatever the bend', () => {
    // The complaint this guards: on a bent edge the head looked pasted on at
    // the wrong angle, because the stroke stopped a fixed distance from the
    // target rather than a fixed distance back along the curve from the tip.
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 5) {
      for (const bend of [BEND_DEFAULT, BEND_PARALLEL, -BEND_PARALLEL, 60]) {
        const at: Positions = {
          a: { x: 170, y: 230 },
          b: { x: 170 + Math.cos(angle) * 140, y: 230 + Math.sin(angle) * 140 },
        };
        const g = edgeGeometry(edge({ bend }), at);
        const tip = tipOf(g.arrow);
        const strokeEnd = lastPointOf(g.path);
        // Where the triangle's base sits, from the head path itself.
        const corners = [...g.arrow.matchAll(/L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
          x: Number(m[1]),
          y: Number(m[2]),
        }));
        const base = {
          x: ((corners[0] as { x: number }).x + (corners[1] as { x: number }).x) / 2,
          y: ((corners[0] as { y: number }).y + (corners[1] as { y: number }).y) / 2,
        };
        expect(dist(strokeEnd, base), `bend ${bend} angle ${angle.toFixed(2)}`).toBeLessThan(1.5);
        expect(dist(strokeEnd, tip)).toBeGreaterThan(6);
      }
    }
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
    // Straight away from the neighbour would put the loop off the left of the
    // canvas, so it has to give up some of that and turn.
    const positions: Positions = { a: { x: 34, y: 230 }, b: { x: 200, y: 230 } };
    const spec = edge({ key: 'a->a', to: 'a', selfLoop: true, neighbours: ['b'] });
    const g = edgeGeometry(spec, positions);
    const anchor = chipAnchor(spec, positions);

    expect(anchor.x).toBeGreaterThan(6);
    // Still on the away side rather than pointing into the neighbour.
    expect(g.normal.x).toBeLessThan(0.2);
  });

  it('never point a loop into another state, wherever that state is', () => {
    // The failure this guards: one neighbour and a start marker cancel exactly
    // under a vector sum, and the loop ends up aimed at the neighbour.
    const chips = ['a, ε → A'];
    const halfW = (chips[0] as string).length * (CHIP_CHAR_W / 2) + CHIP_PAD_X;
    const halfH = CHIP_ROW_HEIGHT / 2;

    for (const start of [false, true]) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        for (const gap of [90, 130]) {
          const a = { x: 150, y: 230 };
          const b = { x: a.x + Math.cos(angle) * gap, y: a.y + Math.sin(angle) * gap };
          const positions: Positions = { a, b };
          const spec = edge({
            key: 'a->a',
            to: 'a',
            selfLoop: true,
            neighbours: ['b'],
            startMarker: start,
            chips,
          });
          const anchor = chipAnchor(spec, positions);
          const where = `angle ${angle.toFixed(2)} gap ${gap} start ${start}`;

          // The chip box clears the neighbour's disc.
          const dx = Math.max(0, Math.abs(b.x - anchor.x) - halfW);
          const dy = Math.max(0, Math.abs(b.y - anchor.y) - halfH);
          expect(Math.hypot(dx, dy), where).toBeGreaterThanOrEqual(STATE_RADIUS);

          // And stays on the canvas.
          expect(anchor.x - halfW, where).toBeGreaterThan(-2);
          expect(anchor.x + halfW, where).toBeLessThan(CANVAS_W + 2);
          expect(anchor.y - halfH, where).toBeGreaterThan(-2);
          expect(anchor.y + halfH, where).toBeLessThan(CANVAS_H + 2);
        }
      }
    }
  });

  it('keep the head on the rim with clearance, like any other edge', () => {
    const positions: Positions = { a: { x: 170, y: 230 } };
    const g = edgeGeometry(edge({ key: 'a->a', to: 'a', selfLoop: true }), positions);
    expect(dist(tipOf(g.arrow), positions.a as { x: number; y: number })).toBeCloseTo(
      STATE_RADIUS + ARROW_CLEARANCE,
      1,
    );
  });

  it('aim away from the start marker, which occupies the left', () => {
    const positions: Positions = { a: { x: 170, y: 230 } };
    const g = edgeGeometry(
      edge({ key: 'a->a', to: 'a', selfLoop: true, startMarker: true }),
      positions,
    );
    expect(g.normal.x).toBeGreaterThan(0.9);
  });

  it('are a compact arc resting on the rim, not a sprawl', () => {
    const at = { x: 170, y: 230 };
    const g = edgeGeometry(edge({ key: 'a->a', to: 'a', selfLoop: true }), { a: at });

    // A real circular arc, so one A command and no cubic control points.
    expect(g.path).toMatch(/^M[-\d. ]+A/);
    expect(g.path).not.toContain('C');

    // The anchor is the far point of the loop. Keeping it under two radii from
    // the centre is what makes it read as a loop rather than a lasso.
    expect(dist(g.anchor, at)).toBeLessThan(STATE_RADIUS * 1.9);
    expect(dist(g.anchor, at)).toBeGreaterThan(STATE_RADIUS);
  });

  it('starts on the rim itself', () => {
    const at = { x: 170, y: 230 };
    const g = edgeGeometry(edge({ key: 'a->a', to: 'a', selfLoop: true }), { a: at });
    const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(g.path);
    expect(dist({ x: Number(m?.[1]), y: Number(m?.[2]) }, at)).toBeCloseTo(STATE_RADIUS, 1);
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

describe('chip placement, all at once', () => {
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxOf = (p: { x: number; y: number }, size: { w: number; h: number }): Box => ({
    x0: p.x - size.w / 2,
    y0: p.y - size.h / 2,
    x1: p.x + size.w / 2,
    y1: p.y + size.h / 2,
  });
  const overlap = (a: Box, b: Box): number =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const intrudes = (b: Box, c: { x: number; y: number }): boolean =>
    Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1)) <
    STATE_RADIUS - 1;

  /** Every reference solution, laid out as authored, with its chips placed. */
  const solutions = [...LEVELS]
    .sort((a, b) => a.index - b.index)
    .map((level) => {
      const m = solutionFor(level.id);
      if (!m) throw new Error(`no solution for ${level.id}`);
      const positions: Positions = Object.fromEntries(
        m.states.map((st) => [st.id, { x: st.x, y: st.y }]),
      );
      const edges = buildEdges(
        m.transitions.map((t) => ({
          id: t.id,
          from: t.from,
          to: t.to,
          chip: transitionChip(t, level.type),
        })),
        m.start,
      );
      const placed = chipAnchors(edges, positions, STATE_RADIUS, undefined, undefined, m.start);
      const { anchors } = placed;
      const boxes = edges.map((e) =>
        boxOf(anchors.get(e.key) as { x: number; y: number }, chipStackSize(e)),
      );
      return { level, machine: m, positions, edges, boxes };
    });

  it('spreads the stacks of a cycle round it instead of piling them in the middle', () => {
    // Counting in threes: three edges round a triangle, two rules each. Each
    // bends the same way round, so on their own all three stacks face inward.
    const l3 = solutions.find((x) => x.level.index === 3);
    if (!l3) throw new Error('no level 3');
    const alone = l3.edges.map((e) => boxOf(chipAnchor(e, l3.positions), chipStackSize(e)));
    const collisions = (boxes: Box[]): number =>
      boxes
        .flatMap((a, i) => boxes.slice(i + 1).map((b) => overlap(a, b)))
        .filter((o) => o > 1).length;
    expect(collisions(alone)).toBeGreaterThan(0);
    expect(collisions(l3.boxes)).toBe(0);
  });

  it('puts no chip on a state, in any reference solution', () => {
    for (const { level, positions, boxes } of solutions) {
      for (const b of boxes) {
        for (const c of Object.values(positions)) expect(intrudes(b, c), level.id).toBe(false);
      }
    }
  });

  it('lets no two stacks overlap, in any reference solution', () => {
    // The Turing ones included: seven states and a stack of six rules in the
    // 340 by 460 sheet, which is the tightest a phone gets.
    for (const { level, boxes } of solutions) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i] as Box, boxes[j] as Box), level.id).toBe(0);
        }
      }
    }
  });

  it('keeps clear air between stacks on every finite or pushdown solution', () => {
    // More than the space between the rows of one stack, so two stacks never
    // read as one taller one.
    for (const { level, boxes } of solutions.filter((x) => x.level.type !== 'TM')) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i] as Box;
          const b = boxes[j] as Box;
          const gap = Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
          expect(gap, level.id).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  /**
   * Points on every stroke as drawn, read back from the path data rather than
   * from the placer's own sampling: quadratic edges, arc loops, and the start
   * marker's shaft.
   */
  function strokePoints(d: string): { x: number; y: number }[] {
    const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const out: { x: number; y: number }[] = [];
    if (d.includes('Q')) {
      const [x0, y0, cx, cy, x1, y1] = n as [number, number, number, number, number, number];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        out.push({
          x: u * u * x0 + 2 * u * t * cx + t * t * x1,
          y: u * u * y0 + 2 * u * t * cy + t * t * y1,
        });
      }
    } else if (d.includes('A')) {
      // M x0 y0 A r r 0 large 1 x1 y1: clockwise, so the centre is right of the chord.
      const [x0, y0, r, , , large, , x1, y1] = n as number[];
      const chord = Math.hypot(x1! - x0!, y1! - y0!);
      const rise = Math.sqrt(Math.max(0, r! * r! - (chord / 2) ** 2)) * (large ? -1 : 1);
      const c = {
        x: (x0! + x1!) / 2 - ((y1! - y0!) / chord) * rise,
        y: (y0! + y1!) / 2 + ((x1! - x0!) / chord) * rise,
      };
      const a0 = Math.atan2(y0! - c.y, x0! - c.x);
      let a1 = Math.atan2(y1! - c.y, x1! - c.x);
      while (a1 < a0) a1 += Math.PI * 2;
      for (let i = 0; i <= 24; i++) {
        const a = a0 + ((a1 - a0) * i) / 24;
        out.push({ x: c.x + r! * Math.cos(a), y: c.y + r! * Math.sin(a) });
      }
    }
    return out;
  }

  const covered = (x: (typeof solutions)[number], boxes: Box[]): number => {
    const lines = x.edges.flatMap((e) => strokePoints(edgeGeometry(e, x.positions).path));
    const start = x.machine.start ? x.positions[x.machine.start] : undefined;
    if (start) {
      for (let i = 0; i <= 24; i++) {
        lines.push({ x: start.x - STATE_RADIUS - 3 - (START_ENTRY_LEN * i) / 24, y: start.y });
      }
    }
    const under = (b: Box): number =>
      lines.filter((q) => q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1).length;
    return boxes.reduce((n, b) => n + under(b), 0);
  };

  it('lays no stack across a line, on any finite or pushdown solution', () => {
    for (const x of solutions.filter((s) => s.level.type !== 'TM')) {
      expect(covered(x, x.boxes), x.level.id).toBe(0);
    }
  });

  it('leaves most of every Turing diagram\'s lines uncovered, even in the bare sheet', () => {
    // A dozen wide rules round seven states in 340 by 460 cannot all find open
    // ground, so some line goes under a label: never more than a fifth of a
    // diagram's, and under a twelfth of all of it.
    let hidden = 0;
    let total = 0;
    for (const x of solutions.filter((s) => s.level.type === 'TM')) {
      const all = covered(x, [{ x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 }]);
      const under = covered(x, x.boxes);
      expect(under / all, x.level.id).toBeLessThanOrEqual(1 / 5);
      hidden += under;
      total += all;
    }
    expect(hidden / total).toBeLessThan(1 / 12);
  });

  it('hangs the stack of an upright edge clear of the line, however wide the rule', () => {
    const positions: Positions = { a: { x: 170, y: 120 }, b: { x: 170, y: 320 } };
    const one = edge({ key: 'a->b', from: 'a', to: 'b', bend: 0, chips: ['a → X, R'] });
    const placed = chipAnchors([one], positions).anchors.get('a->b');
    if (!placed) throw new Error('no anchor');
    const b = boxOf(placed, chipStackSize(one));
    expect(b.x0 > 170 || b.x1 < 170).toBe(true);
    // And so does the stack placed alone.
    const alone = boxOf(chipAnchor(one, positions), chipStackSize(one));
    expect(alone.x0 > 170 || alone.x1 < 170).toBe(true);
  });

  it('keeps an edge on the side it used last time, so labels do not flicker', () => {
    const positions: Positions = { a: { x: 80, y: 200 }, b: { x: 260, y: 200 } };
    const one = edge({ key: 'a->b', from: 'a', to: 'b', chips: ['0'] });
    for (const side of [1, -1] as const) {
      const was = new Map([['a->b', side]]);
      const again = chipAnchors([one], positions, STATE_RADIUS, undefined, was);
      expect(again.sides.get('a->b')).toBe(side);
    }
  });

  it('puts the labels of a cycle outside it, with air between stacks', () => {
    const l3 = solutions.find((x) => x.level.index === 3);
    if (!l3) throw new Error('no level 3');
    const cx = Object.values(l3.positions).reduce((n, p) => n + p.x, 0) / 3;
    const cy = Object.values(l3.positions).reduce((n, p) => n + p.y, 0) / 3;
    l3.edges.forEach((e, i) => {
      const g = edgeGeometry(e, l3.positions);
      const b = l3.boxes[i] as Box;
      const centre = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
      // Further from the middle than the curve it labels.
      expect(Math.hypot(centre.x - cx, centre.y - cy)).toBeGreaterThan(
        Math.hypot(g.anchor.x - cx, g.anchor.y - cy),
      );
    });
  });
});

