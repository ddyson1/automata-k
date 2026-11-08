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
 * Nothing here imports anything. The drag path recomputes edge geometry on
 * every pointer move, so it has to stay cheap and free of allocation-heavy
 * dependencies, and the Swift port has to be able to follow it line for line.
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
/**
 * How far a self loop reaches from the centre of its own state, in radii. A
 * state carrying one takes up this much room, not one radius, which is what a
 * layout has to leave between states.
 */
export const LOOP_REACH = LOOP_CENTRE + LOOP_RADIUS;
/** Height of one chip row in a stack. */
export const CHIP_ROW_HEIGHT = 24;
/**
 * Advance of one character in the chip's monospace face, at the chip's size:
 * Martian Mono pinned at width 100 is 0.7em, and chips are set at 12px.
 */
export const CHIP_CHAR_W = 8.4;
/** Horizontal padding inside a chip. */
export const CHIP_PAD_X = 6;
/** Gap between a curve and the near edge of its chip stack. */
const CHIP_GAP = 10;
const CHIP_GAP_LOOP = 4;
/** Length of the start marker's shaft, which comes in from the left of the start state. */
export const START_ENTRY_LEN = 96;
/** How hard each stretch of line a chip stack covers counts against a place for it. */
const LINE_WEIGHT = 20;
/** How hard each pixel of a chip stack past the visible region counts. */
const OFF_WEIGHT = 8;
/** Spacing of the points a line is sampled at, to see what a stack covers. */
const LINE_STEP = 8;
/** What one stack overlapping another costs on top of its area: more than any detour. */
const STACK_ON_STACK = 600;
/**
 * Clear space wanted between two stacks, past the space inside a stack's own
 * rows, so two stacks never read as one; and what each pixel short of it costs.
 */
const AIR = 8;
const AIR_WEIGHT = 8;
/** What taking the natural spot of a stack not yet placed costs. */
const RESERVED = 16;

/** Directions tried when aiming a self loop. 24 gives 15 degree steps. */
const AIM_CANDIDATES = 24;
/** How hard a chip poking outside the canvas counts against a direction. */
const OUT_WEIGHT = 4;
/** How hard a chip landing on another state counts against a direction. */
const COVER_WEIGHT = 3;
/** All else equal a loop points up, which is where a reader expects it. */
const UP_BIAS = 0.15;

/**
 * The logical canvas, mirrored here as plain numbers rather than imported, so
 * this module keeps its zero dependencies. tests/geometry.test.ts asserts they
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

const n2 = (v: number): string => (Math.round(v * 100) / 100).toString();

// ---------------------------------------------------------------------------
// quadratic helpers
// ---------------------------------------------------------------------------

function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const x = 2 * u * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const y = 2 * u * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

/** The control point of the sub-curve of a quadratic over [a, b]. */
function quadSplitControl(p0: Pt, c: Pt, p1: Pt, a: number, b: number): Pt {
  return lerp(lerp(p0, c, a), lerp(c, p1, a), b);
}

/** Largest t whose point is at least `d` away from `target`. Distance falls with t. */
function tAtDistanceFromEnd(p0: Pt, c: Pt, p1: Pt, target: Pt, d: number): number {
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

/**
 * Largest t at or below `tMax` whose point is at least `d` from `origin`.
 *
 * Used to end the stroke exactly where the arrow triangle's base is. Measuring
 * that distance from the target state instead, which is what this used to do,
 * is only the same thing on a straight edge: on a bent one the two points are
 * different and the head reads as pasted on at the wrong angle.
 */
function tBackFrom(p0: Pt, c: Pt, p1: Pt, tMax: number, origin: Pt, d: number): number {
  let lo = 0;
  let hi = tMax;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const p = quadAt(p0, c, p1, mid);
    if (Math.hypot(p.x - origin.x, p.y - origin.y) >= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Smallest t whose point is at least `d` away from `origin`. Distance grows with t. */
function tAtDistanceFromStart(p0: Pt, c: Pt, p1: Pt, origin: Pt, d: number): number {
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
  const tip = quadAt(from, ctrl, to, tTip);
  const dir = quadTangent(from, ctrl, to, tTip);

  const tBase = tBackFrom(from, ctrl, to, tTip, tip, ARROW_LEN * 0.92);
  const tStart = tAtDistanceFromStart(from, ctrl, to, from, radius);

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

/** Half the width of the widest chip in a stack. */
function chipHalfWidth(chips: readonly string[]): number {
  let longest = 1;
  for (let i = 0; i < chips.length; i++) {
    const n = (chips[i] as string).length;
    if (n > longest) longest = n;
  }
  return (longest * CHIP_CHAR_W) / 2 + CHIP_PAD_X;
}

/**
 * The region a diagram has to stay inside. The logical canvas by default, which
 * is what the authored solutions and the iOS port use; the web app passes the
 * region actually on screen, which is larger and moves with the window.
 */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CANVAS_BOUNDS: Bounds = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };

/**
 * How far a box's centre has to sit from a line, along the line's normal `n`,
 * for the box to clear it: half its height when the line runs across, half its
 * width when it runs up and down, and in between when it runs at an angle.
 */
function reach(n: Pt, halfW: number, halfH: number): number {
  return Math.abs(n.x) * halfW + Math.abs(n.y) * halfH;
}

/** How far a box centred at `c` pokes outside `bounds`. */
function outsideBy(c: Pt, halfW: number, halfH: number, bounds: Bounds): number {
  let out = 0;
  if (c.x - halfW < bounds.x) out += bounds.x - (c.x - halfW);
  if (c.x + halfW > bounds.x + bounds.w) out += c.x + halfW - (bounds.x + bounds.w);
  if (c.y - halfH < bounds.y) out += bounds.y - (c.y - halfH);
  if (c.y + halfH > bounds.y + bounds.h) out += c.y + halfH - (bounds.y + bounds.h);
  return out;
}

/** How deeply a box centred at `c` overlaps a state's disc. */
function coverage(c: Pt, halfW: number, halfH: number, state: Pt, radius: number): number {
  // Distance from the state's centre to the nearest point of the box.
  const dx = Math.max(0, Math.abs(state.x - c.x) - halfW);
  const dy = Math.max(0, Math.abs(state.y - c.y) - halfH);
  const gap = Math.hypot(dx, dy);
  return gap >= radius ? 0 : radius - gap;
}

/**
 * Where a self loop should point.
 *
 * The spec asks for "away from the average direction of the state's other
 * connections", and a vector sum says that literally. It is also fragile: a
 * state with one neighbour and a start marker has those two cancel exactly, and
 * whatever rounding is left over decides the answer, which is how a loop ends
 * up pointing straight into the state next door.
 *
 * So this scores candidate directions instead. Pointing at a connection costs,
 * pointing where the chip stack would leave the canvas costs more, and pointing
 * where the chip stack would land on another state costs most. Ties go up,
 * which is where a reader expects a self loop.
 */
function awayDirection(
  at: Pt,
  neighbours: string[],
  positions: Positions,
  startMarker: boolean,
  chips: readonly string[],
  radius: number,
  bounds: Bounds,
): Pt {
  const rows = Math.max(1, chips.length);
  const halfW = chipHalfWidth(chips);
  const halfH = (rows * CHIP_ROW_HEIGHT) / 2;
  const rim = radius * (LOOP_CENTRE + LOOP_RADIUS) + CHIP_GAP_LOOP;

  let best: Pt = { x: 0, y: -1 };
  let bestScore = -Infinity;

  for (let i = 0; i < AIM_CANDIDATES; i++) {
    // Start at straight up so an exact tie keeps it.
    const angle = -Math.PI / 2 + (i / AIM_CANDIDATES) * Math.PI * 2;
    const dir: Pt = { x: Math.cos(angle), y: Math.sin(angle) };
    // Where the chip stack's centre would sit, matching chipAnchor exactly.
    const out = rim + reach(dir, halfW, halfH);
    const centre: Pt = { x: at.x + dir.x * out, y: at.y + dir.y * out };

    let score = UP_BIAS * -dir.y;
    score -= OUT_WEIGHT * outsideBy(centre, halfW, halfH, bounds);

    // The start marker comes in from the left, so treat that side as occupied.
    if (startMarker) score -= (1 - dir.x) * 0.5;

    for (let k = 0; k < neighbours.length; k++) {
      const p = positions[neighbours[k] as string];
      if (!p) continue;
      const dx = p.x - at.x;
      const dy = p.y - at.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      // A near neighbour crowds a loop harder than a distant one.
      const weight = Math.min(2, 120 / Math.max(60, len));
      score -= (1 + (dir.x * dx + dir.y * dy) / len) * weight;
    }

    // Every state on the canvas, connected or not, is something to not sit on.
    for (const key in positions) {
      const p = positions[key] as Pt;
      if (p === undefined || (p.x === at.x && p.y === at.y)) continue;
      score -= COVER_WEIGHT * coverage(centre, halfW, halfH, p, radius);
    }

    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}

function selfLoop(at: Pt, away: Pt, radius: number): EdgeGeometry {
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
  bounds: Bounds = CANVAS_BOUNDS,
): EdgeGeometry {
  const from = positions[spec.from];
  if (!from) return EMPTY;
  if (spec.selfLoop) {
    const away = awayDirection(
      from,
      spec.neighbours,
      positions,
      spec.startMarker,
      spec.chips,
      radius,
      bounds,
    );
    return selfLoop(from, away, radius);
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
  bounds: Bounds = CANVAS_BOUNDS,
): { strokes: string; heads: string } {
  let strokes = '';
  let heads = '';
  for (let i = 0; i < specs.length; i++) {
    const g = edgeGeometry(specs[i] as EdgeSpec, positions, radius, bounds);
    if (g.path) strokes += g.path;
    if (g.arrow) heads += g.arrow;
  }
  return { strokes, heads };
}

/** Where a chip stack sits, pushed off the curve far enough to clear it. */
export function chipAnchor(
  spec: EdgeSpec,
  positions: Positions,
  radius: number = STATE_RADIUS,
  bounds: Bounds = CANVAS_BOUNDS,
): Pt {
  const g = edgeGeometry(spec, positions, radius, bounds);
  const size = chipStackSize(spec);
  // A self loop's anchor already sits out past the rim, so it needs less push.
  const gap = spec.selfLoop ? CHIP_GAP_LOOP : CHIP_GAP;
  const lift = reach(g.normal, size.w / 2, size.h / 2);
  return {
    x: g.anchor.x + g.normal.x * (gap + lift),
    y: g.anchor.y + g.normal.y * (gap + lift),
  };
}

/** The box a stack of chips occupies, centred on its anchor. */
export function chipStackSize(spec: EdgeSpec): { w: number; h: number } {
  const widest = Math.max(0, ...spec.chips.map((c) => c.length * CHIP_CHAR_W + CHIP_PAD_X * 2));
  return { w: Math.max(22, widest), h: Math.max(1, spec.chips.length) * CHIP_ROW_HEIGHT };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxAt = (p: Pt, size: { w: number; h: number }): Box => ({
  x0: p.x - size.w / 2,
  y0: p.y - size.h / 2,
  x1: p.x + size.w / 2,
  y1: p.y + size.h / 2,
});

const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** How far short of AIR apart two boxes that do not overlap are. Zero when clear. */
function airShort(a: Box, b: Box): number {
  const gapX = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const gapY = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  // Side by side they are as far apart as the larger of the two gaps.
  return Math.max(0, AIR - Math.max(gapX, gapY));
}

/** How far a disc reaches into a box, as a rough area. Zero when they are clear. */
function discIntrusion(box: Box, c: Pt, r: number): number {
  const dx = Math.max(box.x0 - c.x, 0, c.x - box.x1);
  const dy = Math.max(box.y0 - c.y, 0, c.y - box.y1);
  const d = Math.hypot(dx, dy);
  return d >= r ? 0 : (r - d) * 2 * r;
}

/**
 * What a box hanging off the visible region costs. Less, per pixel, than a
 * line hidden under it: the view fits itself to what is drawn, so a stack a
 * little past the edge only means a little more zoom, where a stack on a line
 * means a line nobody can follow.
 */
function offBounds(box: Box, b: Bounds): number {
  const over =
    Math.max(0, b.x - box.x0) +
    Math.max(0, box.x1 - (b.x + b.w)) +
    Math.max(0, b.y - box.y0) +
    Math.max(0, box.y1 - (b.y + b.h));
  return over * OFF_WEIGHT;
}

/**
 * Points along the stroke an edge draws, about every LINE_STEP, so a placer can
 * tell how much of the line a box would hide. Mirrors `betweenStates` and
 * `selfLoop`: the part of the curve outside the states, which is what shows.
 * Takes the edge's geometry, already worked out, for where a loop points.
 */
function strokeSamples(
  spec: EdgeSpec,
  g: EdgeGeometry,
  positions: Positions,
  radius: number,
): Pt[] {
  const from = positions[spec.from];
  if (!from || !g.path) return [];
  const out: Pt[] = [];
  if (spec.selfLoop) {
    const d = radius * LOOP_CENTRE;
    const rl = radius * LOOP_RADIUS;
    const base = Math.atan2(g.normal.y, g.normal.x);
    // The loop shows where its circle is outside the state's, either side of
    // the way it points.
    const k = (radius * radius - d * d - rl * rl) / (2 * d * rl);
    const half = Math.acos(Math.max(-1, Math.min(1, k)));
    const cx = from.x + g.normal.x * d;
    const cy = from.y + g.normal.y * d;
    const n = Math.max(4, Math.ceil((2 * half * rl) / LINE_STEP));
    for (let i = 0; i <= n; i++) {
      const t = base - half + (2 * half * i) / n;
      out.push({ x: cx + rl * Math.cos(t), y: cy + rl * Math.sin(t) });
    }
    return out;
  }
  const to = positions[spec.to];
  if (!to) return [];
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ctrl: Pt = {
    x: (from.x + to.x) / 2 - ((to.y - from.y) / len) * spec.bend,
    y: (from.y + to.y) / 2 + ((to.x - from.x) / len) * spec.bend,
  };
  const a = tAtDistanceFromStart(from, ctrl, to, from, radius);
  const b = tAtDistanceFromEnd(from, ctrl, to, to, radius + ARROW_CLEARANCE);
  const n = Math.max(4, Math.ceil((len - radius * 2) / LINE_STEP));
  for (let i = 0; i <= n; i++) out.push(quadAt(from, ctrl, to, a + ((b - a) * i) / n));
  return out;
}

/** Points along the start marker's shaft, which comes in from the left. */
function entrySamples(at: Pt, radius: number): Pt[] {
  const tip = at.x - radius - ARROW_CLEARANCE;
  const n = Math.ceil(START_ENTRY_LEN / LINE_STEP);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: tip - (START_ENTRY_LEN * i) / n, y: at.y });
  return out;
}

interface Candidate {
  p: Pt;
  side: 1 | -1;
  /** What getting there costs: distance from the curve, and travel along it. */
  detour: number;
}

/** How far each step moves a stack further out. */
const STEP = 9;
/**
 * What `step` steps out cost. Each costs more than the last: a stack a little
 * off its curve still reads as that curve's, one far off reads as another's.
 */
const stepCost = (step: number): number => step * 6 + step * step * 4;

/**
 * Places for a stack beside an edge between two states: either side of the
 * curve, a little further out each time, and slid toward either end, which
 * still reads as that edge's label.
 */
function edgeCandidates(g: EdgeGeometry, size: { w: number; h: number }): Candidate[] {
  const out: Candidate[] = [];
  const lift = reach(g.normal, size.w / 2, size.h / 2);
  const along = { x: -g.normal.y, y: g.normal.x };
  for (const side of [1, -1] as const) {
    for (let step = 0; step < 7; step++) {
      for (const slide of [0, -14, 14, -28, 28, -42, 42]) {
        const d = CHIP_GAP + lift + step * STEP;
        out.push({
          p: {
            x: g.anchor.x + g.normal.x * side * d + along.x * slide,
            y: g.anchor.y + g.normal.y * side * d + along.y * slide,
          },
          side,
          detour: stepCost(step) + Math.abs(slide) * 0.4,
        });
      }
    }
  }
  return out;
}

/**
 * Places for a self loop's stack: off the loop's outer edge, or turned round
 * it to either side, the way a label sits beside a loop that has a neighbour's
 * label in front of it. Turned or not, it stays against the loop.
 */
function loopCandidates(
  g: EdgeGeometry,
  size: { w: number; h: number },
  radius: number,
): Candidate[] {
  const out: Candidate[] = [];
  const rl = radius * LOOP_RADIUS;
  const centre = { x: g.anchor.x - g.normal.x * rl, y: g.anchor.y - g.normal.y * rl };
  for (const turn of [0, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100]) {
    const a = (turn * Math.PI) / 180;
    const u = {
      x: g.normal.x * Math.cos(a) - g.normal.y * Math.sin(a),
      y: g.normal.x * Math.sin(a) + g.normal.y * Math.cos(a),
    };
    const lift = reach(u, size.w / 2, size.h / 2);
    for (let step = 0; step < 7; step++) {
      const d = rl + CHIP_GAP_LOOP + lift + step * STEP;
      out.push({
        p: { x: centre.x + u.x * d, y: centre.y + u.y * d },
        side: 1,
        detour: stepCost(step) + Math.abs(turn) * 0.3,
      });
    }
  }
  return out;
}

/**
 * Where every edge's chips go, together, so that no stack lands on another
 * stack or on a state, and as few as possible lie across a line.
 *
 * `chipAnchor` alone puts a stack on the side its curve bulges toward, and
 * every edge bends the same way round, so around a cycle all the stacks end
 * up inside it, piled on each other in the middle. Here each edge tries both
 * sides of its curve, further out step by step and sliding along it (a loop's
 * stack turns round the loop instead), and takes the place that costs least:
 * a stack on another stack costs more than anything, then a stack on a state,
 * then each stretch of line hidden (every edge's, and the start marker's),
 * then stacks closer than AIR, distance from the curve, and hanging past the
 * edge of the screen. Loops go first, having fewest places to go, then the
 * tallest stacks, and each avoids the spots the ones still to come would
 * naturally take. A side an edge used last time is preferred, so dragging a
 * state does not make labels flicker from side to side.
 */
export function chipAnchors(
  specs: readonly EdgeSpec[],
  positions: Positions,
  radius: number = STATE_RADIUS,
  bounds: Bounds = CANVAS_BOUNDS,
  previous?: ReadonlyMap<string, 1 | -1>,
  start?: string | null,
): { anchors: Map<string, Pt>; sides: Map<string, 1 | -1> } {
  const anchors = new Map<string, Pt>();
  const sides = new Map<string, 1 | -1>();
  const discs = Object.values(positions);
  const geometry = specs.map((spec) => edgeGeometry(spec, positions, radius, bounds));
  const lines: Pt[] = [];
  specs.forEach((spec, i) => {
    lines.push(...strokeSamples(spec, geometry[i] as EdgeGeometry, positions, radius));
  });
  const entry = start ? positions[start] : undefined;
  if (entry) lines.push(...entrySamples(entry, radius));
  // The middle of the machine. All else equal a stack faces away from it, so
  // round a cycle the labels sit outside rather than meeting in the centre.
  const middle: Pt = discs.length
    ? {
        x: discs.reduce((n, p) => n + p.x, 0) / discs.length,
        y: discs.reduce((n, p) => n + p.y, 0) / discs.length,
      }
    : { x: 0, y: 0 };

  interface Job {
    spec: EdgeSpec;
    candidates: (Candidate & { box: Box; lean: number })[];
    /** The line points any of its candidates could cover. */
    near: Pt[];
    /** Where its stack sits with no detour: tight against the curve, either side. */
    natural: Box[];
  }
  const jobs: Job[] = [];
  const boxes = new Map<string, Box>();
  specs.forEach((spec, i) => {
    const g = geometry[i] as EdgeGeometry;
    const size = chipStackSize(spec);
    if (!g.path) {
      // States on top of each other: no curve to hang off, so no choice either.
      const p = chipAnchor(spec, positions, radius, bounds);
      anchors.set(spec.key, p);
      boxes.set(spec.key, boxAt(p, size));
      return;
    }
    const was = previous?.get(spec.key);
    const places = spec.selfLoop ? loopCandidates(g, size, radius) : edgeCandidates(g, size);
    const candidates = places.map((c) => {
      // Keep the side it had; with no history, face away from the middle.
      const outward =
        (g.anchor.x - middle.x) * g.normal.x * c.side +
          (g.anchor.y - middle.y) * g.normal.y * c.side >=
        0;
      const lean =
        was !== undefined ? (c.side === was ? 0 : 6) : !spec.selfLoop && !outward ? 4 : 0;
      return { ...c, box: boxAt(c.p, size), lean };
    });
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const { box } of candidates) {
      x0 = Math.min(x0, box.x0 - 2);
      y0 = Math.min(y0, box.y0 - 2);
      x1 = Math.max(x1, box.x1 + 2);
      y1 = Math.max(y1, box.y1 + 2);
    }
    const near = lines.filter((q) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1);
    const natural = candidates.filter((c) => c.detour === 0).map((c) => c.box);
    jobs.push({ spec, candidates, near, natural });
  });
  // Loops go first, having fewest places to go, then the tallest stacks.
  jobs.sort(
    (a, b) =>
      Number(b.spec.selfLoop) - Number(a.spec.selfLoop) ||
      b.spec.chips.length - a.spec.chips.length,
  );

  /**
   * The best place for one edge's stack, given every stack placed so far.
   * True when even that place lands on another stack.
   */
  function place({ spec, candidates, near }: Job): boolean {
    // Stacks not placed yet still have somewhere they would naturally go.
    // Taking that spot from one of them pushes its label away from its line,
    // so it costs a little, as long as there is anywhere else to be.
    const waiting = jobs.filter((j) => j.spec.key !== spec.key && !boxes.has(j.spec.key));
    let best: (Candidate & { box: Box }) | null = null;
    let bestCost = Infinity;
    for (const c of candidates) {
      const { box } = c;
      let cost = c.detour + c.lean + offBounds(box, bounds);
      for (const d of discs) cost += discIntrusion(box, d, radius + 3) * 3;
      for (const j of waiting) {
        for (const spot of j.natural) if (overlapArea(box, spot) > 0) cost += RESERVED;
      }
      if (cost >= bestCost) continue;
      // One stack on top of another is worse than anything else on offer.
      // Short of that, stacks keep a little air between them, so two never
      // read as one: closer than AIR costs by how much closer, not by how
      // long the two run side by side.
      for (const [key, other] of boxes) {
        if (key === spec.key) continue;
        const area = overlapArea(box, other);
        if (area > 0) cost += STACK_ON_STACK + area * 2;
        else cost += airShort(box, other) * AIR_WEIGHT;
      }
      if (cost >= bestCost) continue;
      // A line under a stack is a line cut in two; a little air there too.
      for (const q of near) {
        if (q.x > box.x0 - 2 && q.x < box.x1 + 2 && q.y > box.y0 - 2 && q.y < box.y1 + 2) {
          cost += LINE_WEIGHT;
          if (cost >= bestCost) break;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    if (!best) return false;
    anchors.set(spec.key, best.p);
    sides.set(spec.key, best.side);
    boxes.set(spec.key, best.box);
    for (const [key, other] of boxes) {
      if (key !== spec.key && overlapArea(best.box, other) > 0) return true;
    }
    return false;
  }

  // Greedy first: each stack against those already down. If that leaves two
  // on top of each other, an early stack took the only spot a later one could
  // use, so each is placed again against all the others.
  let tangled = false;
  for (const job of jobs) tangled = place(job) || tangled;
  for (let pass = 0; tangled && pass < 2; pass++) {
    tangled = false;
    for (const job of jobs) tangled = place(job) || tangled;
  }
  return { anchors, sides };
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
