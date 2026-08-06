/**
 * Arranging a machine so the diagram reads.
 *
 * The old Tidy put every state on a ring, and a ring is the wrong shape twice
 * over.
 *
 * It is wrong in the small. The radius came from a circumference estimate,
 * `n * spacing / 2π`, which treats the arc between two neighbours as if it
 * were the straight line between them. For three states the arc is 21% longer
 * than the chord, so three states of radius 28 landed on a ring of radius 36,
 * six units of clear air between their rims. The circles themselves just about
 * miss each other; a self loop does not. One reaches 1.82 radii out from its
 * own centre, so on that ring every loop was drawn straight through the state
 * next to it, and every three state level has loops.
 *
 * It is wrong in the large too: almost every machine here is a chain, and a
 * chain drawn on a circle reads as a circle, not as a sequence.
 *
 * So rank the states by how far they are from the start along the arrows, and
 * give each rank a column. A chain comes out as a row, in the order it runs. A
 * branch comes out as a fork. Within a column, order by the average height of
 * whatever points at a state, which is the cheap half of what a real graph
 * layout engine does about edge crossings, and at four or five states it is the
 * half that matters.
 *
 * Nothing here is clamped to the logical canvas. Tidy is always followed by a
 * fit, which frames whatever it produced, and a six state chain simply needs
 * more room than a 340 unit wide coordinate frame has.
 */

import { CANVAS, type Machine, type StateId } from './types';

export interface Point {
  x: number;
  y: number;
}

const R = CANVAS.stateRadius;

/** Room between columns for an arrow and the chip riding on it. */
const COL_PITCH = 2 * R + 66;

/** Room between rows for a self loop clear of the state above or below it. */
const ROW_PITCH = 2 * R + 48;

/** Above this, a rank with no structure to it is better off as a grid. */
const GRID_ABOVE = 3;

/** Lay out `n` states with nothing joining them: a squarish grid, centred. */
function gridLayout(n: number): Point[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const x0 = CANVAS.width / 2 - ((cols - 1) * COL_PITCH) / 2;
  const y0 = CANVAS.height / 2 - ((rows - 1) * ROW_PITCH) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(x0 + (i % cols) * COL_PITCH),
    y: Math.round(y0 + Math.floor(i / cols) * ROW_PITCH),
  }));
}

/**
 * Positions for every state of `m`, in the order `m.states` is in.
 *
 * Reads only the graph, never the current coordinates, so it is idempotent:
 * tidying twice gives the same picture as tidying once.
 */
export function layoutMachine(m: Machine): Point[] {
  const n = m.states.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: CANVAS.width / 2, y: CANVAS.height / 2 }];

  const index = new Map<StateId, number>(m.states.map((s, i) => [s.id, i]));

  const out: number[][] = m.states.map(() => []);
  const into: number[][] = m.states.map(() => []);
  for (const t of m.transitions) {
    const a = index.get(t.from);
    const b = index.get(t.to);
    // A self loop says nothing about where a state belongs.
    if (a === undefined || b === undefined || a === b) continue;
    out[a]?.push(b);
    into[b]?.push(a);
  }

  // Rank by breadth first search along the arrows. The start state goes first
  // so the machine is laid out in the direction it runs; anything the start
  // cannot reach is rooted separately, at rank 0, so a stranded state sits
  // beside the beginning rather than trailing off the end.
  const rank = new Array<number>(n).fill(-1);
  const startIndex = m.start === null ? undefined : index.get(m.start);
  const roots = [...(startIndex === undefined ? [] : [startIndex])];
  for (let i = 0; i < n; i++) if (i !== startIndex) roots.push(i);

  for (const root of roots) {
    if (rank[root] !== -1) continue;
    rank[root] = 0;
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head] as number;
      for (const v of out[u] ?? []) {
        if (rank[v] !== -1) continue;
        rank[v] = (rank[u] as number) + 1;
        queue.push(v);
      }
    }
  }

  const depth = Math.max(...rank) + 1;
  // One rank and more than a handful means there is no sequence to show: a
  // scatter of unconnected states, or a set that all loop on themselves.
  if (depth === 1 && n > GRID_ABOVE) return gridLayout(n);

  const columns: number[][] = Array.from({ length: depth }, () => []);
  for (let i = 0; i < n; i++) (columns[rank[i] as number] as number[]).push(i);

  // Order within each column by the mean height of its predecessors in the
  // column before. Three sweeps is enough at this size and cannot oscillate
  // for long; the original order breaks ties, and that is usually the order
  // the states were drawn in.
  const row = new Array<number>(n).fill(0);
  for (const col of columns) col.forEach((i, j) => (row[i] = j));

  for (let pass = 0; pass < 3; pass++) {
    for (let c = 1; c < columns.length; c++) {
      const col = columns[c] as number[];
      const key = new Map<number, number>();
      for (const i of col) {
        const above = (into[i] ?? []).filter((p) => rank[p] === c - 1);
        key.set(
          i,
          above.length === 0
            ? (row[i] as number)
            : above.reduce((sum, p) => sum + (row[p] as number), 0) / above.length,
        );
      }
      col.sort((a, b) => (key.get(a) as number) - (key.get(b) as number) || (row[a] as number) - (row[b] as number));
      col.forEach((i, j) => (row[i] = j));
    }
  }

  const x0 = CANVAS.width / 2 - ((depth - 1) * COL_PITCH) / 2;
  const midY = CANVAS.height / 2;
  const points = new Array<Point>(n);

  columns.forEach((col, c) => {
    // Every column is centred on the same line, so a chain is level and a
    // fork opens symmetrically about it.
    const top = midY - ((col.length - 1) * ROW_PITCH) / 2;
    col.forEach((i, j) => {
      points[i] = {
        x: Math.round(x0 + c * COL_PITCH),
        y: Math.round(top + j * ROW_PITCH),
      };
    });
  });

  return points;
}

/** `m` with its states moved to where `layoutMachine` puts them. */
export function laidOut(m: Machine): Machine {
  const points = layoutMachine(m);
  return {
    ...m,
    states: m.states.map((s, i) => ({ ...s, ...(points[i] ?? { x: s.x, y: s.y }) })),
  };
}
