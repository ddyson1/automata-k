/**
 * The diagram.
 *
 * One SVG, built once and then mutated. The rules it keeps, from section 8 of
 * the spec:
 *
 *   - No SVG markers. Every arrowhead is a filled triangle placed at the
 *     curve's tangent so it lands about 3px off the target's rim.
 *   - Every edge bends slightly, and bends wider when a reverse edge exists.
 *   - Self loops aim away from the average direction of the state's other
 *     connections, and away from a near wall.
 *   - Several transitions between the same pair stack as separate chips rather
 *     than concatenating into one label.
 *   - A drag never commits a position per frame. It writes transforms straight
 *     onto these nodes and calls moveState once, on release.
 *
 * The arrow maths lives in src/ui/geometry.ts, shared with the tests that pin
 * it, and is imported here unchanged.
 */

import {
  CANVAS_H,
  CANVAS_W,
  CHIP_CHAR_W,
  CHIP_PAD_X,
  CHIP_ROW_HEIGHT,
  STATE_RADIUS,
  buildEdges,
  chipAnchor,
  edgeGeometry,
  edgesPathData,
} from '../../../src/ui/geometry';
import type { EdgeSpec, Positions, Pt } from '../../../src/ui/geometry';
import { transitionChip, transitionPlain } from '../../../src/engine/formal';
import type { Machine, MachineKind, StateId, TransitionId } from '../../../src/engine/types';
import { h, on, setAttr, svg } from '../dom';
import { reducedMotion, tap } from '../haptics';

/** Martian Mono advances 0.7em at width 100, and geometry.ts sizes chips at CHIP_CHAR_W. */
const CHIP_FONT = CHIP_CHAR_W / 0.7;

/**
 * A state's name is drawn inside its circle, and names run to six characters.
 * Six of Martian Mono at 14px is wider than the circle, so long names step
 * down a size rather than spill over the rim.
 */
const labelSize = (label: string): number => (label.length > 5 ? 11.5 : label.length > 4 ? 12.5 : 14);
const CHIP_H = 19;

const START_MARKER_LEN = 22;
/** How far out in the chamber the start arrow begins its fade in. */
const START_ENTRY_LEN = 96;
const MIN_SCALE = 0.45;
const MAX_SCALE = 3.2;
const LONG_PRESS_MS = 480;
/** Pointer travel that turns a tap into a drag. */
const DRAG_SLOP = 4;
/**
 * Pressing inside the circle moves the state; pressing in the halo just outside
 * it pulls an arrow. Putting the connect zone outside rather than inside is the
 * whole difference between "grab the edge and pull" and a hidden mode you
 * trigger by clicking too close to the rim.
 */
const CONNECT_OUTER = 46;
/** Margin fit leaves around the machine. The top clears the view controls. */
const FIT_PAD = 18;
const FIT_PAD_TOP = 54;
/**
 * Logical units per CSS pixel at scale 1. Chosen so the whole 340 unit sheet
 * fits across a phone; anything wider than that is extra room rather than
 * magnification.
 */
const BASE_ZOOM = 1.1;
/**
 * Tidy moves states on a spring rather than in one jump, so the eye can follow
 * each state to where it went. A little under critical damping: they arrive
 * with a settle, not a bounce.
 */
const SPRING_K = 190;
const SPRING_C = 22;
/** How long a pulse takes to run the length of an arrow. Under a trace step. */
const PULSE_MS = 420;

export interface DiagramCallbacks {
  onSelectState: (id: StateId | null) => void;
  onSelectEdge: (ids: TransitionId[]) => void;
  onMoveState: (id: StateId, x: number, y: number) => void;
  onConnect: (from: StateId, to: StateId) => void;
  onRename: (id: StateId) => void;
  onBackgroundTap: (x: number, y: number) => void;
  /** Double click on empty canvas. The only way to make a state. */
  onPlaceState: (x: number, y: number) => void;
  /**
   * The selected state has moved on screen, because it was dragged or the view
   * changed. The controls attached to it follow.
   */
  onAnchorMoved: () => void;
}

export interface DiagramState {
  machine: Machine;
  kind: MachineKind;
  selectedState: StateId | null;
  selectedEdge: string | null;
  /** States lit by the trace player, or by a highlighted delta line. */
  activeStates: readonly StateId[];
  /** Transitions lit by a hovered or focused delta line. */
  activeTransitions: readonly TransitionId[];
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface Diagram {
  el: HTMLElement;
  update(state: DiagramState): void;
  fit(): void;
  zoomBy(factor: number): void;
  resetView(): void;
  /** Where a state currently sits, in client coordinates. */
  screenPointOf(id: StateId): { x: number; y: number; r: number } | null;
  /** The region on screen, in logical units. Placement clamps to it. */
  visibleBounds(): { x: number; y: number; w: number; h: number };
  /** The next change of positions, and the fit after it, move rather than jump. */
  glide(): void;
  /**
   * Send a pulse along the arrows that carry these rules: the trace just used
   * them. `ms` is how long it takes; a fast run passes a short one.
   */
  pulse(ids: readonly TransitionId[], ms?: number): void;
  /** A ring off a state: just placed, or a string of the suite landing in it. */
  bloom(id: StateId, kind: 'place' | 'pass' | 'fail'): void;
  destroy(): void;
}

export function createDiagram(callbacks: DiagramCallbacks): Diagram {
  // -- nodes ----------------------------------------------------------------

  const root = svg('svg', {
    class: 'diagram',
    viewBox: `0 0 ${CANVAS_W} ${CANVAS_H}`,
    preserveAspectRatio: 'xMidYMid meet',
    'data-testid': 'diagram',
    role: 'application',
    'aria-label': 'Machine diagram',
    tabindex: '0',
  });

  /**
   * The grid covers the whole element and its pattern is transformed with the
   * view, so it reads as one unbounded surface that pans and zooms with what is
   * drawn on it. There is no card: the pane is the canvas.
   */
  const dotsId = `dots-${Math.random().toString(36).slice(2, 9)}`;
  const defs = svg('defs');
  const pattern = svg('pattern', {
    id: dotsId,
    width: 20,
    height: 20,
    patternUnits: 'userSpaceOnUse',
  });
  pattern.appendChild(svg('circle', { cx: 1, cy: 1, r: 1, class: 'dot' }));
  defs.appendChild(pattern);

  // The chamber's light. A halo every state gives off, brighter while the
  // trace is in it; the lit core itself; the shadow a state casts on Mist;
  // and the fade the input arrives along.
  const uid = Math.random().toString(36).slice(2, 9);
  const stop = (offset: string, cls: string, opacity = '1'): SVGStopElement =>
    svg('stop', { offset, class: cls, 'stop-opacity': opacity });
  const entryGradient = svg(
    'linearGradient',
    { id: `entry-${uid}`, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 1, y1: 0, y2: 0 },
    stop('0', 'g-ink', '0'),
    stop('0.55', 'g-ink', '0.55'),
    stop('1', 'g-ink', '1'),
  );
  defs.append(
    svg('radialGradient', { id: `halo-${uid}` }, stop('0.3', 'g-energy'), stop('1', 'g-energy', '0')),
    svg(
      'radialGradient',
      { id: `core-${uid}`, cx: '0.38', cy: '0.34', r: '0.78' },
      stop('0', 'g-energy-hi'),
      stop('1', 'g-energy'),
    ),
    svg(
      'radialGradient',
      { id: `shade-${uid}` },
      stop('0.15', 'g-shade', '0.17'),
      stop('1', 'g-shade', '0'),
    ),
    entryGradient,
  );

  const grid = svg('rect', { class: 'grid', fill: `url(#${dotsId})` });

  const viewport = svg('g', { class: 'viewport' });
  root.style.setProperty('--core-fill', `url(#core-${uid})`);
  const edgeGlow = svg('path', { class: 'edge-glow', d: '', fill: 'none' });
  const edgeStrokes = svg('path', { class: 'edge-stroke', d: '', fill: 'none' });
  const edgeHeads = svg('path', { class: 'edge-head', d: '' });
  const pulseLayer = svg('g', { class: 'pulses', 'aria-hidden': 'true' });
  const edgeHitLayer = svg('g', { class: 'edge-hits' });
  const chipLayer = svg('g', { class: 'chips' });
  const startMarker = svg('g', { class: 'start-marker' });
  const startShaft = svg('path', {
    class: 'start-shaft',
    d: '',
    fill: 'none',
    stroke: `url(#entry-${uid})`,
  });
  // A little energy running in along the shaft: the input arriving.
  const startFlow = svg('path', { class: 'start-flow', d: '', fill: 'none' });
  const bloomLayer = svg('g', { class: 'blooms', 'aria-hidden': 'true' });
  const startHead = svg('path', { class: 'start-head', d: '' });
  const stateLayer = svg('g', { class: 'states' });
  const pending = svg('path', { class: 'pending', d: '', fill: 'none' });

  startMarker.append(startShaft, startFlow, startHead);
  viewport.append(
    edgeGlow,
    edgeStrokes,
    edgeHeads,
    pulseLayer,
    startMarker,
    stateLayer,
    bloomLayer,
    chipLayer,
    edgeHitLayer,
    pending,
  );
  root.append(defs, grid, viewport);

  const el = h('div', { class: 'diagram-wrap' }, root);

  // -- live model -----------------------------------------------------------

  let model: DiagramState = {
    machine: { states: [], transitions: [], start: null, accepting: [] },
    kind: 'DFA',
    selectedState: null,
    selectedEdge: null,
    activeStates: [],
    activeTransitions: [],
  };
  let edges: EdgeSpec[] = [];
  let view: View = { scale: 1, tx: 0, ty: 0 };
  /** Authoritative positions, overwritten in place while a state is dragged. */
  const positions: Positions = {};
  const stateNodes = new Map<StateId, SVGGElement>();
  const cleanups: (() => void)[] = [];
  let hovered: StateId | null = null;
  let dropTarget: StateId | null = null;

  // -- a rule, read out --------------------------------------------------------
  //
  // A chip says a, X → Y. Hovering it, or reaching it with the keyboard, says
  // what that means: read a, take X off the top, put Y on. Touch has no hover;
  // there, the rule editor and the trace say it instead.

  const chipTip = h('div', { class: 'chip-tip', role: 'tooltip', 'data-testid': 'chip-tip', hidden: true });
  el.appendChild(chipTip);
  let tipFor: string | null = null;

  const plainFor = (id: string): string => {
    const t = model.machine.transitions.find((x) => x.id === id);
    return t ? transitionPlain(t, model.kind, model.machine) : '';
  };

  function showChipTip(chip: Element): void {
    const id = chip.getAttribute('data-transition');
    const said = id ? plainFor(id) : '';
    if (!id || !said) return;
    tipFor = id;
    chipTip.textContent = said;
    chipTip.hidden = false;
    const box = chip.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    const half = chipTip.offsetWidth / 2;
    const centre = box.left + box.width / 2 - host.left;
    chipTip.style.left = `${clamp(centre, half + 8, Math.max(half + 8, host.width - half - 8))}px`;
    chipTip.style.top = `${box.top - host.top - 6}px`;
  }

  function hideChipTip(): void {
    tipFor = null;
    chipTip.hidden = true;
  }

  const chipOf = (target: EventTarget | null): Element | null =>
    target instanceof Element ? target.closest('.chip') : null;

  cleanups.push(
    on(chipLayer, 'pointerover', (event) => {
      const e = event as PointerEvent;
      if (e.pointerType === 'touch' || drag || rimDrag) return;
      const chip = chipOf(e.target);
      if (chip) showChipTip(chip);
    }),
    on(chipLayer, 'pointerout', (event) => {
      const e = event as PointerEvent;
      const chip = chipOf(e.target);
      if (chip && !(e.relatedTarget instanceof Node && chip.contains(e.relatedTarget))) hideChipTip();
    }),
    on(chipLayer, 'focusin', (event) => {
      const chip = chipOf(event.target);
      if (chip && chip.matches(':focus-visible')) showChipTip(chip);
    }),
    on(chipLayer, 'focusout', () => hideChipTip()),
  );

  // -- coordinate mapping ---------------------------------------------------

  /**
   * The visible region. It is sized from the element in pixels rather than
   * anchored to the 340 x 460 sheet, so a taller window shows more of the world
   * instead of magnifying the same part of it. The sheet stays centred in it,
   * and a drag still clamps to the sheet, so authored coordinates and the iOS
   * port are unaffected.
   */
  let box = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };

  function syncViewBox(): void {
    const rect = root.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const w = rect.width / BASE_ZOOM;
    const hgt = rect.height / BASE_ZOOM;
    box = { x: CANVAS_W / 2 - w / 2, y: CANVAS_H / 2 - hgt / 2, w, h: hgt };
    setAttr(grid, 'x', box.x.toFixed(2));
    setAttr(grid, 'y', box.y.toFixed(2));
    setAttr(grid, 'width', box.w.toFixed(2));
    setAttr(grid, 'height', box.h.toFixed(2));
    setAttr(
      root,
      'viewBox',
      `${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`,
    );
  }

  /** Viewport-space point for a client point, before the view transform. */
  function toViewport(clientX: number, clientY: number): Pt {
    const rect = root.getBoundingClientRect();
    const s = rect.width / box.w || 1;
    return {
      x: box.x + (clientX - rect.left) / s,
      y: box.y + (clientY - rect.top) / s,
    };
  }

  /** Client point to logical canvas point, through the viewBox and the view. */
  function toCanvas(clientX: number, clientY: number): Pt {
    const v = toViewport(clientX, clientY);
    return { x: (v.x - view.tx) / view.scale, y: (v.y - view.ty) / view.scale };
  }

  /** Canvas units per client pixel, for turning a drag into a pan. */
  function unitsPerPixel(): number {
    const rect = root.getBoundingClientRect();
    return box.w / (rect.width || 1);
  }

  function applyView(): void {
    setAttr(
      viewport,
      'transform',
      `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.scale.toFixed(4)})`,
    );
    // The grid is outside that transform, so its pattern carries it instead.
    setAttr(
      pattern,
      'patternTransform',
      `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.scale.toFixed(4)})`,
    );
    callbacks.onAnchorMoved();
  }

  // -- drawing --------------------------------------------------------------

  function drawEdges(): void {
    const { strokes, heads } = edgesPathData(edges, positions, STATE_RADIUS, box);
    setAttr(edgeGlow, 'd', strokes);
    setAttr(edgeStrokes, 'd', strokes);
    setAttr(edgeHeads, 'd', heads);
    drawChips();
    drawStartMarker();
  }

  /**
   * Chips hang off the curve, one row per transition, so three rules between
   * the same pair read as three rules.
   */
  function drawChips(): void {
    const keepTip = tipFor;
    chipLayer.textContent = '';
    edgeHitLayer.textContent = '';

    for (const edge of edges) {
      const anchor = chipAnchor(edge, positions, STATE_RADIUS, box);
      const rows = edge.chips.length;
      const lit = edge.transitionIds.some((id) => model.activeTransitions.includes(id));
      const selected = model.selectedEdge === edge.key;

      edge.chips.forEach((label, i) => {
        const width = Math.max(22, label.length * CHIP_CHAR_W + CHIP_PAD_X * 2);
        const cy = anchor.y - ((rows - 1) / 2) * CHIP_ROW_HEIGHT + i * CHIP_ROW_HEIGHT;
        const id = edge.transitionIds[i] as string;
        const one = model.activeTransitions.includes(id);

        const group = svg('g', {
          class: `chip${selected ? ' is-selected' : ''}${lit || one ? ' is-lit' : ''}`,
          'data-edge': edge.key,
          'data-transition': id,
          role: 'button',
          tabindex: '0',
          'aria-label': `Rule ${label}: ${plainFor(id)}. Tap to edit.`,
        });
        group.append(
          svg('rect', {
            x: (anchor.x - width / 2).toFixed(2),
            y: (cy - CHIP_H / 2).toFixed(2),
            width: width.toFixed(2),
            height: CHIP_H,
            rx: 5,
            class: 'chip-bg',
          }),
          svg(
            'text',
            {
              x: anchor.x.toFixed(2),
              y: (cy + 0.5).toFixed(2),
              class: 'chip-text',
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-size': CHIP_FONT,
            },
            label,
          ),
        );
        chipLayer.appendChild(group);
      });
    }

    // Chips are rebuilt on every update; a rule being read out stays read out.
    const again = keepTip ? chipLayer.querySelector(`[data-transition="${CSS.escape(keepTip)}"]`) : null;
    if (again) showChipTip(again);
    else if (keepTip) hideChipTip();
  }

  function drawStartMarker(): void {
    const start = model.machine.start;
    const at = start ? positions[start] : undefined;
    if (!at) {
      setAttr(startShaft, 'd', '');
      setAttr(startFlow, 'd', '');
      setAttr(startHead, 'd', '');
      return;
    }
    const tipX = at.x - STATE_RADIUS - 3;
    // The input arrives from out in the chamber, fading in along the way.
    const tailX = tipX - START_ENTRY_LEN;
    const shaft = `M${tailX.toFixed(2)} ${at.y.toFixed(2)}H${(tipX - 8).toFixed(2)}`;
    setAttr(startShaft, 'd', shaft);
    setAttr(startFlow, 'd', shaft);
    setAttr(entryGradient, 'x1', tailX.toFixed(2));
    setAttr(entryGradient, 'x2', (tipX - 8).toFixed(2));
    setAttr(
      startHead,
      'd',
      `M${tipX.toFixed(2)} ${at.y.toFixed(2)}` +
        `L${(tipX - 9.5).toFixed(2)} ${(at.y - 5).toFixed(2)}` +
        `L${(tipX - 9.5).toFixed(2)} ${(at.y + 5).toFixed(2)}Z`,
    );
  }

  function drawStates(): void {
    const seen = new Set<StateId>();

    for (const state of model.machine.states) {
      seen.add(state.id);
      let node = stateNodes.get(state.id);
      if (!node) {
        node = svg('g', {
          class: 'state',
          'data-id': state.id,
          role: 'button',
          tabindex: '0',
        });
        node.append(
          svg('circle', { class: 'state-hit', r: CONNECT_OUTER, cx: 0, cy: 0 }),
          // The shadow it casts on Mist, and the light it gives off: faint at
          // rest, bright while the trace is in it.
          svg('circle', {
            class: 'state-shadow',
            r: (STATE_RADIUS * 1.35).toFixed(2),
            cx: 2,
            cy: 10,
            fill: `url(#shade-${uid})`,
          }),
          svg('circle', {
            class: 'state-halo',
            r: (STATE_RADIUS * 2.2).toFixed(2),
            cx: 0,
            cy: 0,
            fill: `url(#halo-${uid})`,
          }),
          svg('circle', { class: 'state-ring', r: STATE_RADIUS, cx: 0, cy: 0 }),
          svg('circle', { class: 'state-accept', r: STATE_RADIUS - 4.5, cx: 0, cy: 0 }),
          svg('text', {
            class: 'state-label',
            x: 0,
            y: 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': 14,
          }),
          // Dragging anywhere in the band just outside the rim draws an arrow,
          // but nothing on screen says so. Four grips say it, on whichever
          // state the pointer is over, and vanish again when it leaves.
          ...[0, 90, 180, 270].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return svg('circle', {
              class: 'state-grip',
              r: 4.5,
              cx: (Math.cos(a) * (STATE_RADIUS + 7)).toFixed(2),
              cy: (Math.sin(a) * (STATE_RADIUS + 7)).toFixed(2),
              'data-grip': state.id,
            });
          }),
        );
        stateNodes.set(state.id, node);
        stateLayer.appendChild(node);
      }

      const pos = positions[state.id] ?? { x: state.x, y: state.y };
      setAttr(node, 'transform', `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);

      const isStart = model.machine.start === state.id;
      const accepting = model.machine.accepting.includes(state.id);
      paintStateClass(state.id, node);
      const label = node.querySelector('.state-label') as SVGTextElement;
      if (label.textContent !== state.label) {
        label.textContent = state.label;
        label.setAttribute('font-size', String(labelSize(state.label)));
      }
      node.setAttribute(
        'aria-label',
        `State ${state.label}${isStart ? ', start' : ''}${accepting ? ', accepting' : ''}`,
      );
    }

    for (const [id, node] of stateNodes) {
      if (!seen.has(id)) {
        node.remove();
        stateNodes.delete(id);
      }
    }
  }

  /**
   * One place that decides a state's classes, because hover and drop target are
   * set by the pointer while selection and the trace are set by the model, and
   * whichever wrote last used to win.
   */
  function paintStateClass(id: StateId, node: SVGGElement): void {
    const classes = ['state'];
    if (model.machine.accepting.includes(id)) classes.push('is-accepting');
    if (model.selectedState === id) classes.push('is-selected');
    if (model.activeStates.includes(id)) classes.push('is-active');
    if (hovered === id) classes.push('is-hover');
    if (dropTarget === id) classes.push('is-target');
    setAttr(node, 'class', classes.join(' '));
  }

  function paintStateClasses(): void {
    for (const [id, node] of stateNodes) paintStateClass(id, node);
  }

  function rebuild(): void {
    const before: Positions = { ...positions };
    for (const key of Object.keys(positions)) delete positions[key];
    for (const state of model.machine.states) positions[state.id] = { x: state.x, y: state.y };
    stopGlide(false);
    if (glideArmed && !reducedMotion()) startGlide(before);
    glideArmed = false;

    edges = buildEdges(
      model.machine.transitions.map((t) => ({
        id: t.id,
        from: t.from,
        to: t.to,
        chip: transitionChip(t, model.kind),
      })),
      model.machine.start,
    );
    drawStates();
    drawEdges();
  }

  // -- gliding --------------------------------------------------------------
  //
  // `positions` is what is drawn. While a glide runs it holds where each state
  // is on its way, and `targets` holds where the model says it is.

  let glideArmed = false;
  let glide: { targets: Positions; vel: Map<StateId, Pt>; raf: number; last: number } | null =
    null;
  let viewTween = 0;

  function paintGliding(): void {
    root.classList.toggle('is-gliding', glide !== null || viewTween !== 0);
  }

  function startGlide(from: Positions): void {
    const targets: Positions = {};
    const vel = new Map<StateId, Pt>();
    let moving = false;
    for (const state of model.machine.states) {
      const to = positions[state.id];
      const at = from[state.id];
      if (!to) continue;
      targets[state.id] = { ...to };
      if (!at) continue;
      if (Math.hypot(to.x - at.x, to.y - at.y) > 0.5) moving = true;
      positions[state.id] = { x: at.x, y: at.y };
      vel.set(state.id, { x: 0, y: 0 });
    }
    if (!moving) {
      Object.assign(positions, targets);
      return;
    }
    glide = { targets, vel, raf: 0, last: performance.now() };
    glide.raf = requestAnimationFrame(stepGlide);
    paintGliding();
  }

  function stepGlide(now: number): void {
    const g = glide;
    if (!g) return;
    const dt = Math.min(1 / 30, Math.max(0.001, (now - g.last) / 1000));
    g.last = now;
    let settled = true;
    for (const [id, to] of Object.entries(g.targets)) {
      const at = positions[id];
      const v = g.vel.get(id);
      if (!at || !v) continue;
      v.x += (SPRING_K * (to.x - at.x) - SPRING_C * v.x) * dt;
      v.y += (SPRING_K * (to.y - at.y) - SPRING_C * v.y) * dt;
      at.x += v.x * dt;
      at.y += v.y * dt;
      if (Math.hypot(to.x - at.x, to.y - at.y) > 0.2 || Math.hypot(v.x, v.y) > 3) settled = false;
    }
    if (settled) {
      stopGlide(true);
      return;
    }
    drawStates();
    drawEdges();
    callbacks.onAnchorMoved();
    g.raf = requestAnimationFrame(stepGlide);
  }

  /** End a glide. `land` puts every state where it was going. */
  function stopGlide(land: boolean): void {
    const g = glide;
    if (!g) return;
    cancelAnimationFrame(g.raf);
    glide = null;
    paintGliding();
    if (!land) return;
    for (const [id, to] of Object.entries(g.targets)) positions[id] = { ...to };
    drawStates();
    drawEdges();
    callbacks.onAnchorMoved();
  }

  /** Ease the view to `next` instead of cutting to it. */
  function tweenView(next: View): void {
    cancelAnimationFrame(viewTween);
    const from = { ...view };
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / 460);
      const e = 1 - (1 - k) ** 3;
      view = {
        scale: from.scale + (next.scale - from.scale) * e,
        tx: from.tx + (next.tx - from.tx) * e,
        ty: from.ty + (next.ty - from.ty) * e,
      };
      applyView();
      if (k < 1) viewTween = requestAnimationFrame(step);
      else {
        viewTween = 0;
        paintGliding();
      }
    };
    viewTween = requestAnimationFrame(step);
    paintGliding();
  }

  function stopViewTween(): void {
    if (!viewTween) return;
    cancelAnimationFrame(viewTween);
    viewTween = 0;
    paintGliding();
  }

  // -- the trace, along the arrows -------------------------------------------

  function pulse(ids: readonly TransitionId[], ms = PULSE_MS): void {
    if (ids.length === 0 || reducedMotion()) return;
    const at: Positions = glide ? { ...positions } : positions;
    const seen = new Set<string>();
    for (const id of ids) {
      const edge = edges.find((e) => e.transitionIds.includes(id));
      if (!edge || seen.has(edge.key)) continue;
      seen.add(edge.key);
      const d = edgeGeometry(edge, at, STATE_RADIUS, box).path;
      if (!d) continue;
      const path = svg('path', { class: 'edge-pulse', d, fill: 'none' });
      pulseLayer.appendChild(path);
      const length = path.getTotalLength?.() ?? 0;
      if (!(length > 0) || typeof path.animate !== 'function') {
        path.remove();
        continue;
      }
      const run = Math.min(28, length * 0.45);
      path.style.strokeDasharray = `${run} ${length + run}`;
      const anim = path.animate(
        [
          { strokeDashoffset: run, opacity: 0.2 },
          { strokeDashoffset: -length * 0.5, opacity: 1, offset: 0.5 },
          { strokeDashoffset: -length, opacity: 0.6 },
        ],
        { duration: ms, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
      );
      anim.onfinish = () => path.remove();
      anim.oncancel = () => path.remove();
      comet(path, length, ms);
    }
  }

  /** A bright head with a glow, riding the pulse along its arrow. */
  function comet(path: SVGPathElement, length: number, ms: number): void {
    const glow = svg('circle', { class: 'pulse-glow', r: 15, cx: 0, cy: 0 });
    const dot = svg('circle', { class: 'pulse-dot', r: 4.3, cx: 0, cy: 0 });
    const shine = svg('circle', { class: 'pulse-shine', r: 1.6, cx: -1.1, cy: -1.1 });
    const head = svg('g', { class: 'pulse-head' }, glow, dot, shine);
    pulseLayer.appendChild(head);
    const t0 = performance.now();
    const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
    const step = (now: number): void => {
      const u = Math.min(1, (now - t0) / ms);
      const p = path.getPointAtLength(length * ease(u));
      head.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      if (u < 1 && head.isConnected) requestAnimationFrame(step);
      else head.remove();
    };
    requestAnimationFrame(step);
  }

  /**
   * A ring off a state. Placing a state or making it accepting sends one out
   * in energy; a string of the suite landing sends one out in pass or fail.
   */
  function bloom(id: StateId, kind: 'place' | 'pass' | 'fail'): void {
    if (reducedMotion()) return;
    const at = positions[id];
    if (!at) return;
    const ring = svg('circle', {
      class: `bloom is-${kind}`,
      cx: at.x.toFixed(2),
      cy: at.y.toFixed(2),
      r: STATE_RADIUS,
    });
    bloomLayer.appendChild(ring);
    const done = (): void => ring.remove();
    ring.addEventListener('animationend', done);
    setTimeout(done, 1600);
  }

  // -- fitting --------------------------------------------------------------

  /**
   * Frame everything that is drawn, chips included. Chips hang well off the
   * curve, so bounds taken from state centres alone would clip them.
   */
  function contentBounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    const states = model.machine.states;
    if (states.length === 0) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (x: number, y: number, padX: number, padY: number): void => {
      x0 = Math.min(x0, x - padX);
      y0 = Math.min(y0, y - padY);
      x1 = Math.max(x1, x + padX);
      y1 = Math.max(y1, y + padY);
    };
    // Mid glide, frame where the states are going rather than where they are.
    const where: Positions = glide ? { ...positions, ...glide.targets } : positions;
    for (const s of states) grow(s.x, s.y, STATE_RADIUS + 6, STATE_RADIUS + 6);
    if (model.machine.start) {
      const at = where[model.machine.start];
      if (at) grow(at.x - STATE_RADIUS - START_MARKER_LEN, at.y, 4, 4);
    }
    for (const edge of edges) {
      const a = chipAnchor(edge, where, STATE_RADIUS, box);
      const chars = Math.max(...edge.chips.map((c) => c.length), 1);
      grow(
        a.x,
        a.y,
        (chars * CHIP_CHAR_W) / 2 + CHIP_PAD_X + 4,
        (Math.max(1, edge.chips.length) * CHIP_ROW_HEIGHT) / 2 + 6,
      );
    }
    return { x0, y0, x1, y1 };
  }

  function fit(): void {
    const b = contentBounds();
    if (!b) {
      resetView();
      return;
    }
    const w = Math.max(1, b.x1 - b.x0);
    const hgt = Math.max(1, b.y1 - b.y0);
    // Frame into the box minus the strip the floating controls sit in, so a
    // machine that has just been fitted is never partly behind a button.
    const availW = Math.max(40, box.w - FIT_PAD * 2);
    const availH = Math.max(40, box.h - FIT_PAD - FIT_PAD_TOP);
    const scale = clamp(Math.min(availW / w, availH / hgt, 1.6), MIN_SCALE, MAX_SCALE);
    const next = {
      scale,
      tx: box.x + FIT_PAD + availW / 2 - ((b.x0 + b.x1) / 2) * scale,
      ty: box.y + FIT_PAD_TOP + availH / 2 - ((b.y0 + b.y1) / 2) * scale,
    };
    // A fit that follows a tidy travels with the states.
    if (glide && !reducedMotion()) {
      tweenView(next);
      return;
    }
    stopViewTween();
    view = next;
    applyView();
  }

  function resetView(): void {
    view = { scale: 1, tx: 0, ty: 0 };
    applyView();
  }

  function zoomAbout(factor: number, at: Pt): void {
    const next = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = next / view.scale;
    // Keep the logical point under the cursor fixed.
    view = {
      scale: next,
      tx: at.x - (at.x - view.tx) * k,
      ty: at.y - (at.y - view.ty) * k,
    };
    applyView();
  }

  // -- gestures -------------------------------------------------------------

  interface Live {
    id: number;
    startClient: Pt;
    lastClient: Pt;
  }

  const live = new Map<number, Live>();
  let drag: {
    state: StateId;
    grabDx: number;
    grabDy: number;
    moved: boolean;
    longPress: ReturnType<typeof setTimeout> | null;
  } | null = null;
  let rimDrag: { from: StateId; to: Pt } | null = null;
  let panFrom: { view: View; client: Pt } | null = null;
  let pinch: { distance: number; centre: Pt } | null = null;

  function stateAt(p: Pt): StateId | null {
    // Later states are drawn on top, so hit test in reverse.
    for (let i = model.machine.states.length - 1; i >= 0; i--) {
      const s = model.machine.states[i];
      if (!s) continue;
      const at = positions[s.id];
      if (!at) continue;
      if (Math.hypot(p.x - at.x, p.y - at.y) <= CONNECT_OUTER) return s.id;
    }
    return null;
  }

  /** The state under the pointer: its grips show, so the gesture is visible. */
  function setHover(id: StateId | null): void {
    if (hovered === id) return;
    hovered = id;
    paintStateClasses();
  }

  /** While an arrow is being pulled, the state it would land on. */
  function setDropTarget(id: StateId | null): void {
    if (dropTarget === id) return;
    dropTarget = id;
    paintStateClasses();
  }

  function cancelLongPress(): void {
    if (drag?.longPress) {
      clearTimeout(drag.longPress);
      drag.longPress = null;
    }
  }

  function drawPendingArrow(): void {
    if (!rimDrag) {
      setAttr(pending, 'd', '');
      return;
    }
    const from = positions[rimDrag.from];
    if (!from) return;
    const dx = rimDrag.to.x - from.x;
    const dy = rimDrag.to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const sx = from.x + (dx / len) * STATE_RADIUS;
    const sy = from.y + (dy / len) * STATE_RADIUS;
    setAttr(
      pending,
      'd',
      `M${sx.toFixed(2)} ${sy.toFixed(2)}L${rimDrag.to.x.toFixed(2)} ${rimDrag.to.y.toFixed(2)}`,
    );
  }

  cleanups.push(
    on(root as unknown as HTMLElement, 'pointerdown', (event) => {
      const e = event as PointerEvent;
      // A hand on the canvas wins over anything still moving on it.
      stopGlide(true);
      stopViewTween();
      root.setPointerCapture(e.pointerId);
      live.set(e.pointerId, {
        id: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        lastClient: { x: e.clientX, y: e.clientY },
      });

      if (live.size === 2) {
        // A second finger converts whatever was happening into a pinch.
        cancelLongPress();
        drag = null;
        rimDrag = null;
        drawPendingArrow();
        const [a, b] = [...live.values()] as [Live, Live];
        pinch = {
          distance: Math.hypot(a.lastClient.x - b.lastClient.x, a.lastClient.y - b.lastClient.y),
          centre: {
            x: (a.lastClient.x + b.lastClient.x) / 2,
            y: (a.lastClient.y + b.lastClient.y) / 2,
          },
        };
        panFrom = { view: { ...view }, client: pinch.centre };
        return;
      }
      if (live.size > 2) return;

      const p = toCanvas(e.clientX, e.clientY);
      const chip = (e.target as Element).closest?.('.chip');
      if (chip) {
        const ids = chip.getAttribute('data-edge');
        const edge = edges.find((x) => x.key === ids);
        if (edge) callbacks.onSelectEdge(edge.transitionIds);
        return;
      }

      // The grip on the selected state is a rim drag with a visible target.
      const grip = (e.target as Element).getAttribute?.('data-grip');
      if (grip) {
        rimDrag = { from: grip, to: p };
        drawPendingArrow();
        return;
      }

      const hit = stateAt(p);
      if (hit === null) {
        panFrom = { view: { ...view }, client: { x: e.clientX, y: e.clientY } };
        return;
      }

      const at = positions[hit] as Pt;
      const distance = Math.hypot(p.x - at.x, p.y - at.y);

      // Outside the circle but inside the halo: pull a new arrow.
      if (distance > STATE_RADIUS) {
        rimDrag = { from: hit, to: p };
        drawPendingArrow();
        return;
      }

      drag = {
        state: hit,
        grabDx: p.x - at.x,
        grabDy: p.y - at.y,
        moved: false,
        longPress: setTimeout(() => {
          if (!drag || drag.moved) return;
          drag = null;
          tap();
          callbacks.onRename(hit);
        }, LONG_PRESS_MS),
      };
      callbacks.onSelectState(hit);
    }),
  );

  cleanups.push(
    on(root as unknown as HTMLElement, 'pointermove', (event) => {
      const e = event as PointerEvent;
      const tracked = live.get(e.pointerId);
      if (!tracked) return;
      tracked.lastClient = { x: e.clientX, y: e.clientY };

      if (pinch && live.size >= 2) {
        const [a, b] = [...live.values()] as [Live, Live];
        const distance = Math.hypot(
          a.lastClient.x - b.lastClient.x,
          a.lastClient.y - b.lastClient.y,
        );
        const centre = {
          x: (a.lastClient.x + b.lastClient.x) / 2,
          y: (a.lastClient.y + b.lastClient.y) / 2,
        };
        if (pinch.distance > 4) {
          const at = toViewport(centre.x, centre.y);
          zoomAbout(distance / pinch.distance, at);
        }
        if (panFrom) {
          const k = unitsPerPixel();
          view.tx += (centre.x - panFrom.client.x) * k;
          view.ty += (centre.y - panFrom.client.y) * k;
          panFrom.client = centre;
          applyView();
        }
        pinch = { distance, centre };
        return;
      }

      if (drag) {
        const moved =
          Math.hypot(e.clientX - tracked.startClient.x, e.clientY - tracked.startClient.y) >
          DRAG_SLOP;
        if (moved) {
          drag.moved = true;
          cancelLongPress();
        }
        if (!drag.moved) return;

        const p = toCanvas(e.clientX, e.clientY);
        const x = clamp(p.x - drag.grabDx, box.x + STATE_RADIUS, box.x + box.w - STATE_RADIUS);
        const y = clamp(p.y - drag.grabDy, box.y + STATE_RADIUS, box.y + box.h - STATE_RADIUS);
        // Straight into the geometry. Nothing here reaches the store.
        const at = positions[drag.state] as Pt;
        at.x = x;
        at.y = y;
        const node = stateNodes.get(drag.state);
        if (node) setAttr(node, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        drawEdges();
        callbacks.onAnchorMoved();
        return;
      }

      if (rimDrag) {
        rimDrag.to = toCanvas(e.clientX, e.clientY);
        drawPendingArrow();
        setDropTarget(stateAt(rimDrag.to));
        return;
      }

      if (panFrom) {
        const k = unitsPerPixel();
        view = {
          scale: panFrom.view.scale,
          tx: panFrom.view.tx + (e.clientX - panFrom.client.x) * k,
          ty: panFrom.view.ty + (e.clientY - panFrom.client.y) * k,
        };
        applyView();
      }
    }),
  );

  function endPointer(e: PointerEvent): void {
    const tracked = live.get(e.pointerId);
    live.delete(e.pointerId);
    if (live.size < 2) pinch = null;

    if (drag) {
      cancelLongPress();
      const { state, moved } = drag;
      drag = null;
      if (moved) {
        const at = positions[state] as Pt;
        callbacks.onMoveState(state, at.x, at.y);
        tap();
      }
      return;
    }

    if (rimDrag) {
      const { from } = rimDrag;
      const to = rimDrag.to;
      rimDrag = null;
      drawPendingArrow();
      setDropTarget(null);
      const target = stateAt(to);
      const origin = positions[from] as Pt;
      const travelled = Math.hypot(to.x - origin.x, to.y - origin.y);
      if (target !== null) {
        callbacks.onConnect(from, target);
        tap();
      } else if (travelled < STATE_RADIUS + 4) {
        // A press on the rim that went nowhere is a plain selection.
        callbacks.onSelectState(from);
      }
      return;
    }

    if (panFrom && tracked) {
      const travelled = Math.hypot(
        e.clientX - tracked.startClient.x,
        e.clientY - tracked.startClient.y,
      );
      panFrom = null;
      if (travelled <= DRAG_SLOP) {
        const p = toCanvas(e.clientX, e.clientY);
        callbacks.onBackgroundTap(p.x, p.y);
      }
      return;
    }
    panFrom = null;
  }

  cleanups.push(
    on(root as unknown as HTMLElement, 'pointermove', (event) => {
      const e = event as PointerEvent;
      if (drag || rimDrag || panFrom || pinch || e.pointerType === 'touch') return;
      setHover(stateAt(toCanvas(e.clientX, e.clientY)));
    }),
    on(root as unknown as HTMLElement, 'pointerleave', () => setHover(null)),
    on(root as unknown as HTMLElement, 'pointerup', (e) => endPointer(e as PointerEvent)),
    on(root as unknown as HTMLElement, 'pointercancel', (e) => {
      const event = e as PointerEvent;
      live.delete(event.pointerId);
      cancelLongPress();
      drag = null;
      rimDrag = null;
      panFrom = null;
      pinch = null;
      setDropTarget(null);
      drawPendingArrow();
    }),
    on(
      root as unknown as HTMLElement,
      'wheel',
      (event) => {
        const e = event as WheelEvent;
        e.preventDefault();
        stopViewTween();
        const at = toViewport(e.clientX, e.clientY);
        if (e.ctrlKey || e.metaKey) {
          zoomAbout(Math.exp(-e.deltaY / 220), at);
        } else {
          const k = unitsPerPixel();
          view.tx -= e.deltaX * k;
          view.ty -= e.deltaY * k;
          applyView();
        }
      },
      { passive: false },
    ),
    on(root as unknown as HTMLElement, 'dblclick', (event) => {
      const e = event as MouseEvent;
      const target = e.target as Element;
      if (target.closest?.('.chip') || target.closest?.('.state')) return;
      const p = toCanvas(e.clientX, e.clientY);
      callbacks.onPlaceState(p.x, p.y);
      tap();
    }),
    // Keyboard reaches the same actions as touch, for anyone not using a pointer.
    on(root as unknown as HTMLElement, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      const focused = (e.target as Element).closest?.('.state');
      if ((e.key === 'Enter' || e.key === ' ') && focused) {
        e.preventDefault();
        const id = focused.getAttribute('data-id');
        if (id) callbacks.onSelectState(id);
        return;
      }
      const chip = (e.target as Element).closest?.('.chip');
      if ((e.key === 'Enter' || e.key === ' ') && chip) {
        e.preventDefault();
        const edge = edges.find((x) => x.key === chip.getAttribute('data-edge'));
        if (edge) callbacks.onSelectEdge(edge.transitionIds);
      }
    }),
  );

  // -- sizing ---------------------------------------------------------------

  // The visible region always stays centred on the logical canvas, so a resize
  // only ever adds or removes margin. Nothing in the view needs correcting.
  const observer = new ResizeObserver(() => syncViewBox());
  observer.observe(el);
  cleanups.push(() => observer.disconnect());
  syncViewBox();

  // -- api ------------------------------------------------------------------

  return {
    el,
    update(next) {
      const previous = model;
      model = next;
      const structural =
        previous.machine !== next.machine ||
        previous.kind !== next.kind ||
        stateNodes.size !== next.machine.states.length;
      if (structural) rebuild();
      else {
        drawStates();
        drawChips();
      }
      callbacks.onAnchorMoved();
    },
    fit,
    zoomBy(factor) {
      zoomAbout(factor, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    },
    resetView,
    visibleBounds() {
      return { ...box };
    },
    glide() {
      glideArmed = true;
    },
    pulse,
    bloom,
    screenPointOf(id) {
      const at = positions[id];
      if (!at) return null;
      const rect = root.getBoundingClientRect();
      const s = (rect.width / box.w || 1) * view.scale;
      return {
        x: rect.left + (at.x * view.scale + view.tx - box.x) * (rect.width / box.w || 1),
        y: rect.top + (at.y * view.scale + view.ty - box.y) * (rect.width / box.w || 1),
        r: STATE_RADIUS * s,
      };
    },
    destroy() {
      stopGlide(false);
      stopViewTween();
      for (const off of cleanups) off();
      cleanups.length = 0;
    },
  };
}
