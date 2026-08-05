/**
 * Edge geometry.
 *
 * Section 8 of the spec, kept verbatim from what the prototype learned:
 *
 *   - No SVG markers. The head is a filled triangle placed at the curve's
 *     tangent so it lands on the target circle with about 3px clearance.
 *   - Every edge gets a slight bend by default and a wider bend when a reverse
 *     edge exists, so parallel arrows separate.
 *   - Self loops aim away from the average direction of that state's other
 *     connections.
 *
 * Every function here is a worklet: the drag path recomputes edge geometry on
 * the UI thread, never through React state.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Positions = Record<string, Pt>;

export const STATE_RADIUS = 28;
export const HIT_RADIUS = 36;
/** Gap between the arrow tip and the target state's rim. */
export const ARROW_CLEARANCE = 3;
export const ARROW_LEN = 11;
export const ARROW_HALF_WIDTH = 5.2;
export const BEND_DEFAULT = 11;
export const BEND_PARALLEL = 34;
/**
 * A self loop is an arc of a small circle resting against the state's rim:
 * centre `LOOP_CENTRE * radius` out along the aim direction, radius
 * `LOOP_RADIUS * radius`. Drawing it as a real circular arc rather than a
 * hand-tuned cubic is what keeps it compact and even.
 */
const LOOP_CENTRE = 1.14;
const LOOP_RADIUS = 0.68;
/** Room a self loop's chip stack needs beyond the loop itself. */
const CHIP_CLEARANCE = 34;
/** How hard a nearby wall pushes a self loop back toward the middle. */
const EDGE_WEIGHT = 1.6;

/**
 * The logical canvas, mirrored here as plain numbers so the worklets above
 * never close over an imported object. tests/geometry.test.ts asserts these
 * stay equal to CANVAS in the engine.
 */
export const CANVAS_W = 340;
export const CANVAS_H = 460;

/** A drawable edge: one diagram arrow, carrying one or more transitions. */
export interface EdgeSpec {
  key: string;
  from: string;
  to: string;
  selfLoop: boolean;
  /** Perpendicular offset of the control point. Ignored by self loops. */
  bend: number;
  /** Self loops only: the other states this one connects to, for aiming. */
  neighbours: string[];
  /** Self loops only: true when the start marker also occupies this state's left. */
  startMarker: boolean;
  transitionIds: string[];
  /** One chip per transition on this edge. */
  chips: string[];
}

export interface EdgeGeometry {
  /** The stroked curve, already trimmed to the arrowhead's base. */
  path: string;
  /** The filled arrow triangle. */
  arrow: string;
  /** Where the label chips hang. */
  anchor: Pt;
  /** Unit normal pointing away from the curve, for stacking chips. */
  normal: Pt;
}

const EMPTY: EdgeGeometry = {
  path: '',
  arrow: '',
  anchor: { x: 0, y: 0 },
  normal: { x: 0, y: -1 },
};

const n2 = (v: number): string => {
  'worklet';
  return (Math.round(v * 100) / 100).toString();
};

// ---------------------------------------------------------------------------
// quadratic helpers
// ---------------------------------------------------------------------------

function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  'worklet';
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  'worklet';
  const u = 1 - t;
  const x = 2 * u * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const y = 2 * u * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => {
  'worklet';
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

/** The control point of the sub-curve of a quadratic over [a, b]. */
function quadSplitControl(p0: Pt, c: Pt, p1: Pt, a: number, b: number): Pt {
  'worklet';
  return lerp(lerp(p0, c, a), lerp(c, p1, a), b);
}

/** Largest t whose point is at least `d` away from `target`. Distance falls with t. */
function tAtDistanceFromEnd(p0: Pt, c: Pt, p1: Pt, target: Pt, d: number): number {
  'worklet';
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const p = quadAt(p0, c, p1, mid);
    if (Math.hypot(p.x - target.x, p.y - target.y) >= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Smallest t whose point is at least `d` away from `origin`. Distance grows with t. */
function tAtDistanceFromStart(p0: Pt, c: Pt, p1: Pt, origin: Pt, d: number): number {
  'worklet';
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const p = quadAt(p0, c, p1, mid);
    if (Math.hypot(p.x - origin.x, p.y - origin.y) >= d) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The filled triangle, tip first. */
function triangle(tip: Pt, dir: Pt): string {
  'worklet';
  const px = -dir.y;
  const py = dir.x;
  const bx = tip.x - dir.x * ARROW_LEN;
  const by = tip.y - dir.y * ARROW_LEN;
  return (
    `M${n2(tip.x)} ${n2(tip.y)}` +
    `L${n2(bx + px * ARROW_HALF_WIDTH)} ${n2(by + py * ARROW_HALF_WIDTH)}` +
    `L${n2(bx - px * ARROW_HALF_WIDTH)} ${n2(by - py * ARROW_HALF_WIDTH)}Z`
  );
}

// ---------------------------------------------------------------------------
// edges
// ---------------------------------------------------------------------------

function betweenStates(from: Pt, to: Pt, bend: number, radius: number): EdgeGeometry {
  'worklet';
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return EMPTY;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const ctrl: Pt = {
    x: (from.x + to.x) / 2 + nx * bend,
    y: (from.y + to.y) / 2 + ny * bend,
  };

  const tipDistance = radius + ARROW_CLEARANCE;
  // States dragged on top of each other have nowhere to put an arrow.
  if (len <= radius + tipDistance + 2) return EMPTY;

  const tTip = tAtDistanceFromEnd(from, ctrl, to, to, tipDistance);
  const tBase = tAtDistanceFromEnd(from, ctrl, to, to, tipDistance + ARROW_LEN * 0.92);
  const tStart = tAtDistanceFromStart(from, ctrl, to, from, radius);

  const tip = quadAt(from, ctrl, to, tTip);
  const dir = quadTangent(from, ctrl, to, tTip);

  const a = Math.min(tStart, tBase);
  const b = Math.max(tStart, tBase);
  const start = quadAt(from, ctrl, to, a);
  const end = quadAt(from, ctrl, to, b);
  const sub = quadSplitControl(from, ctrl, to, a, b);

  const anchor = quadAt(from, ctrl, to, 0.5);
  const sign = bend >= 0 ? 1 : -1;

  return {
    path: `M${n2(start.x)} ${n2(start.y)}Q${n2(sub.x)} ${n2(sub.y)} ${n2(end.x)} ${n2(end.y)}`,
    arrow: triangle(tip, dir),
    anchor,
    normal: { x: nx * sign, y: ny * sign },
  };
}

/**
 * Where a self loop should point.
 *
 * Primarily away from the average direction of the state's other connections,
 * as the spec asks. A near canvas edge counts as something to avoid too, or a
 * loop on a state at the rim throws its label chips off the card.
 */
function awayDirection(
  at: Pt,
  neighbours: string[],
  positions: Positions,
  startMarker: boolean,
): Pt {
  'worklet';
  let sx = 0;
  let sy = 0;
  let n = 0;

  // The start marker comes in from the left, so treat it as occupied.
  if (startMarker) {
    sx -= 1;
    n++;
  }
  for (let i = 0; i < neighbours.length; i++) {
    const p = positions[neighbours[i] as string];
    if (!p) continue;
    const dx = p.x - at.x;
    const dy = p.y - at.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    sx += dx / len;
    sy += dy / len;
    n++;
  }

  // Pseudo-neighbours at the walls, weighted by how close the state is. The
  // weight scales with the pull already accumulated, so a wall can still win
  // against several neighbours dragging the loop off the canvas.
  const reach = STATE_RADIUS * (LOOP_CENTRE + LOOP_RADIUS) + CHIP_CLEARANCE;
  const weight = EDGE_WEIGHT * (Math.hypot(sx, sy) + 1);
  if (at.x < reach) {
    sx -= weight * (1 - at.x / reach);
    n++;
  }
  if (at.x > CANVAS_W - reach) {
    sx += weight * (1 - (CANVAS_W - at.x) / reach);
    n++;
  }
  if (at.y < reach) {
    sy -= weight * (1 - at.y / reach);
    n++;
  }
  if (at.y > CANVAS_H - reach) {
    sy += weight * (1 - (CANVAS_H - at.y) / reach);
    n++;
  }

  if (n === 0) return { x: 0, y: -1 };
  const len = Math.hypot(sx, sy);
  if (len < 0.02) return { x: 0, y: -1 };
  return { x: -sx / len, y: -sy / len };
}

function selfLoop(at: Pt, away: Pt, radius: number): EdgeGeometry {
  'worklet';
  const d = radius * LOOP_CENTRE;
  const rl = radius * LOOP_RADIUS;
  const base = Math.atan2(away.y, away.x);
  const cx = at.x + away.x * d;
  const cy = at.y + away.y * d;

  // Angle, measured on the loop circle, at which it crosses a circle of
  // radius `rr` around the state.
  const crossing = (rr: number): number => {
    const k = (rr * rr - d * d - rl * rl) / (2 * d * rl);
    return Math.acos(Math.max(-1, Math.min(1, k)));
  };

  const footAngle = base - crossing(radius);
  const tipAngle = base + crossing(radius + ARROW_CLEARANCE);
  const baseAngle = tipAngle - (ARROW_LEN * 0.92) / rl;

  const on = (t: number): Pt => ({ x: cx + rl * Math.cos(t), y: cy + rl * Math.sin(t) });

  const p0 = on(footAngle);
  const pEnd = on(baseAngle);
  const tip = on(tipAngle);
  // Travelling with increasing angle, so the tangent is the rotated radius.
  const dir: Pt = { x: -Math.sin(tipAngle), y: Math.cos(tipAngle) };
  const large = baseAngle - footAngle > Math.PI ? 1 : 0;

  return {
    path:
      `M${n2(p0.x)} ${n2(p0.y)}` +
      `A${n2(rl)} ${n2(rl)} 0 ${large} 1 ${n2(pEnd.x)} ${n2(pEnd.y)}`,
    arrow: triangle(tip, dir),
    anchor: { x: at.x + away.x * (d + rl), y: at.y + away.y * (d + rl) },
    normal: away,
  };
}

/** Geometry for one edge, given the live positions of every state. */
export function edgeGeometry(
  spec: EdgeSpec,
  positions: Positions,
  radius: number = STATE_RADIUS,
): EdgeGeometry {
  'worklet';
  const from = positions[spec.from];
  if (!from) return EMPTY;
  if (spec.selfLoop) {
    return selfLoop(
      from,
      awayDirection(from, spec.neighbours, positions, spec.startMarker),
      radius,
    );
  }
  const to = positions[spec.to];
  if (!to) return EMPTY;
  return betweenStates(from, to, spec.bend, radius);
}

/** Concatenated `d` for a set of edges, so one Path can draw all of them. */
export function edgesPathData(
  specs: EdgeSpec[],
  positions: Positions,
  radius: number = STATE_RADIUS,
): { strokes: string; heads: string } {
  'worklet';
  let strokes = '';
  let heads = '';
  for (let i = 0; i < specs.length; i++) {
    const g = edgeGeometry(specs[i] as EdgeSpec, positions, radius);
    if (g.path) strokes += g.path;
    if (g.arrow) heads += g.arrow;
  }
  return { strokes, heads };
}

/** Where a chip stack sits, and how far each row is pushed off the curve. */
export const CHIP_ROW_HEIGHT = 24;

export function chipAnchor(
  spec: EdgeSpec,
  positions: Positions,
  radius: number = STATE_RADIUS,
): Pt {
  'worklet';
  const g = edgeGeometry(spec, positions, radius);
  const rows = Math.max(1, spec.chips.length);
  // A self loop's anchor already sits out past the rim, so it needs less push.
  const gap = spec.selfLoop ? 4 : 10;
  const lift = (rows * CHIP_ROW_HEIGHT) / 2;
  return {
    x: g.anchor.x + g.normal.x * (gap + lift),
    y: g.anchor.y + g.normal.y * (gap + lift),
  };
}

// ---------------------------------------------------------------------------
// building the edge list, on the JS thread
// ---------------------------------------------------------------------------

export interface EdgeSource {
  id: string;
  from: string;
  to: string;
  chip: string;
}

/**
 * Group transitions into diagram edges. One edge per ordered pair of states,
 * carrying every transition between them, so multiple transitions stack as
 * chips rather than concatenating into one label.
 */
export function buildEdges(transitions: EdgeSource[], startId?: string | null): EdgeSpec[] {
  const pairs = new Set(transitions.map((t) => `${t.from}->${t.to}`));
  const order: string[] = [];
  const grouped = new Map<string, EdgeSource[]>();

  for (const t of transitions) {
    const key = `${t.from}->${t.to}`;
    const list = grouped.get(key);
    if (list) list.push(t);
    else {
      order.push(key);
      grouped.set(key, [t]);
    }
  }

  // Every state's connections, used to aim self loops away from them.
  const connections = new Map<string, Set<string>>();
  const note = (a: string, b: string) => {
    if (a === b) return;
    const set = connections.get(a);
    if (set) set.add(b);
    else connections.set(a, new Set([b]));
  };
  for (const t of transitions) {
    note(t.from, t.to);
    note(t.to, t.from);
  }

  return order.map((key) => {
    const list = grouped.get(key) as EdgeSource[];
    const first = list[0] as EdgeSource;
    const selfLoopEdge = first.from === first.to;
    const hasReverse = !selfLoopEdge && pairs.has(`${first.to}->${first.from}`);
    return {
      key,
      from: first.from,
      to: first.to,
      selfLoop: selfLoopEdge,
      bend: selfLoopEdge ? 0 : hasReverse ? BEND_PARALLEL : BEND_DEFAULT,
      neighbours: selfLoopEdge ? [...(connections.get(first.from) ?? [])] : [],
      startMarker: selfLoopEdge && first.from === startId,
      transitionIds: list.map((t) => t.id),
      chips: list.map((t) => t.chip),
    };
  });
}
