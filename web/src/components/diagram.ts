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
  CHIP_ROW_HEIGHT,
  HIT_RADIUS,
  STATE_RADIUS,
  buildEdges,
  chipAnchor,
  edgesPathData,
} from '../../../src/ui/geometry';
import type { EdgeSpec, Positions, Pt } from '../../../src/ui/geometry';
import { transitionChip } from '../../../src/engine/formal';
import type { Machine, MachineKind, StateId, TransitionId } from '../../../src/engine/types';
import { h, on, setAttr, svg } from '../dom';
import { tap } from '../haptics';

const CHIP_FONT = 12;
/** JetBrains Mono advances 0.6em, so a chip's width follows from its length. */
const CHIP_CHAR_W = CHIP_FONT * 0.6;
const CHIP_PAD_X = 6;
const CHIP_H = 19;

const START_MARKER_LEN = 22;
const MIN_SCALE = 0.45;
const MAX_SCALE = 3.2;
const LONG_PRESS_MS = 480;
/** Pointer travel that turns a tap into a drag. */
const DRAG_SLOP = 4;
/** How close to the rim a press must start to mean "pull a new arrow". */
const RIM_BAND = 11;

export type DiagramMode = 'select' | 'connect';

export interface DiagramCallbacks {
  onSelectState: (id: StateId | null) => void;
  onSelectEdge: (ids: TransitionId[]) => void;
  onMoveState: (id: StateId, x: number, y: number) => void;
  onConnect: (from: StateId, to: StateId) => void;
  onRename: (id: StateId) => void;
  onBackgroundTap: (x: number, y: number) => void;
}

export interface DiagramState {
  machine: Machine;
  kind: MachineKind;
  mode: DiagramMode;
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

  const viewport = svg('g', { class: 'viewport' });
  const edgeStrokes = svg('path', { class: 'edge-stroke', d: '', fill: 'none' });
  const edgeHeads = svg('path', { class: 'edge-head', d: '' });
  const edgeHitLayer = svg('g', { class: 'edge-hits' });
  const chipLayer = svg('g', { class: 'chips' });
  const startMarker = svg('g', { class: 'start-marker' });
  const startShaft = svg('path', { class: 'start-shaft', d: '', fill: 'none' });
  const startHead = svg('path', { class: 'start-head', d: '' });
  const stateLayer = svg('g', { class: 'states' });
  const pending = svg('path', { class: 'pending', d: '', fill: 'none' });

  startMarker.append(startShaft, startHead);
  viewport.append(edgeStrokes, edgeHeads, chipLayer, startMarker, stateLayer, edgeHitLayer, pending);
  root.append(viewport);

  const el = h('div', { class: 'diagram-wrap' }, root);

  // -- live model -----------------------------------------------------------

  let model: DiagramState = {
    machine: { states: [], transitions: [], start: null, accepting: [] },
    kind: 'DFA',
    mode: 'select',
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

  // -- coordinate mapping ---------------------------------------------------

  /**
   * The visible region, which is the logical canvas grown on whichever axis the
   * card has room to spare. Letterboxing a 340 x 460 box into a wide card would
   * waste most of it; growing the viewBox instead hands that space to the
   * player. Authored coordinates stay put because the logical box is always
   * centred inside the visible one, and dragging still clamps to it.
   */
  let box = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };

  function syncViewBox(): void {
    const rect = root.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const aspect = rect.width / rect.height;
    let w = CANVAS_W;
    let hgt = CANVAS_H;
    if (aspect > CANVAS_W / CANVAS_H) w = CANVAS_H * aspect;
    else hgt = CANVAS_W / aspect;
    box = { x: (CANVAS_W - w) / 2, y: (CANVAS_H - hgt) / 2, w, h: hgt };
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
    setAttr(viewport, 'transform', `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.scale.toFixed(4)})`);
  }

  // -- drawing --------------------------------------------------------------

  function drawEdges(): void {
    const { strokes, heads } = edgesPathData(edges, positions);
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
    chipLayer.textContent = '';
    edgeHitLayer.textContent = '';

    for (const edge of edges) {
      const anchor = chipAnchor(edge, positions);
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
          'aria-label': `Rule ${label}. Tap to edit.`,
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
  }

  function drawStartMarker(): void {
    const start = model.machine.start;
    const at = start ? positions[start] : undefined;
    if (!at) {
      setAttr(startShaft, 'd', '');
      setAttr(startHead, 'd', '');
      return;
    }
    const tipX = at.x - STATE_RADIUS - 3;
    const tailX = tipX - START_MARKER_LEN;
    setAttr(startShaft, 'd', `M${tailX.toFixed(2)} ${at.y.toFixed(2)}H${(tipX - 8).toFixed(2)}`);
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
          svg('circle', { class: 'state-hit', r: HIT_RADIUS, cx: 0, cy: 0 }),
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
        );
        stateNodes.set(state.id, node);
        stateLayer.appendChild(node);
      }

      const pos = positions[state.id] ?? { x: state.x, y: state.y };
      setAttr(node, 'transform', `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);

      const accepting = model.machine.accepting.includes(state.id);
      const isStart = model.machine.start === state.id;
      const selected = model.selectedState === state.id;
      const active = model.activeStates.includes(state.id);
      node.setAttribute(
        'class',
        `state${accepting ? ' is-accepting' : ''}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`,
      );
      const label = node.querySelector('.state-label') as SVGTextElement;
      if (label.textContent !== state.label) label.textContent = state.label;
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

  function rebuild(): void {
    for (const key of Object.keys(positions)) delete positions[key];
    for (const state of model.machine.states) positions[state.id] = { x: state.x, y: state.y };

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
    for (const s of states) grow(s.x, s.y, STATE_RADIUS + 6, STATE_RADIUS + 6);
    if (model.machine.start) {
      const at = positions[model.machine.start];
      if (at) grow(at.x - STATE_RADIUS - START_MARKER_LEN, at.y, 4, 4);
    }
    for (const edge of edges) {
      const a = chipAnchor(edge, positions);
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
    const scale = clamp(Math.min(box.w / w, box.h / hgt, 1.6), MIN_SCALE, MAX_SCALE);
    view = {
      scale,
      tx: box.x + box.w / 2 - ((b.x0 + b.x1) / 2) * scale,
      ty: box.y + box.h / 2 - ((b.y0 + b.y1) / 2) * scale,
    };
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
  let connectFrom: StateId | null = null;

  function stateAt(p: Pt): StateId | null {
    // Later states are drawn on top, so hit test in reverse.
    for (let i = model.machine.states.length - 1; i >= 0; i--) {
      const s = model.machine.states[i];
      if (!s) continue;
      const at = positions[s.id];
      if (!at) continue;
      if (Math.hypot(p.x - at.x, p.y - at.y) <= HIT_RADIUS) return s.id;
    }
    return null;
  }

  function cancelLongPress(): void {
    if (drag?.longPress) {
      clearTimeout(drag.longPress);
      drag.longPress = null;
    }
  }

  function beginConnect(id: StateId): void {
    if (connectFrom === null) {
      connectFrom = id;
      highlightPendingSource();
      return;
    }
    const from = connectFrom;
    connectFrom = null;
    highlightPendingSource();
    callbacks.onConnect(from, id);
  }

  function highlightPendingSource(): void {
    for (const [id, node] of stateNodes) node.classList.toggle('is-pending', id === connectFrom);
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

      const hit = stateAt(p);
      if (hit === null) {
        panFrom = { view: { ...view }, client: { x: e.clientX, y: e.clientY } };
        return;
      }

      const at = positions[hit] as Pt;
      const distance = Math.hypot(p.x - at.x, p.y - at.y);

      if (model.mode === 'connect') {
        beginConnect(hit);
        return;
      }

      // Pressing near the rim pulls a new arrow instead of moving the state.
      if (distance > STATE_RADIUS - RIM_BAND) {
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
        const x = clamp(p.x - drag.grabDx, STATE_RADIUS, CANVAS_W - STATE_RADIUS);
        const y = clamp(p.y - drag.grabDy, STATE_RADIUS, CANVAS_H - STATE_RADIUS);
        // Straight into the geometry. Nothing here reaches the store.
        const at = positions[drag.state] as Pt;
        at.x = x;
        at.y = y;
        const node = stateNodes.get(drag.state);
        if (node) setAttr(node, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        drawEdges();
        return;
      }

      if (rimDrag) {
        rimDrag.to = toCanvas(e.clientX, e.clientY);
        drawPendingArrow();
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
        if (connectFrom !== null) {
          connectFrom = null;
          highlightPendingSource();
          return;
        }
        callbacks.onBackgroundTap(p.x, p.y);
      }
      return;
    }
    panFrom = null;
  }

  cleanups.push(
    on(root as unknown as HTMLElement, 'pointerup', (e) => endPointer(e as PointerEvent)),
    on(root as unknown as HTMLElement, 'pointercancel', (e) => {
      const event = e as PointerEvent;
      live.delete(event.pointerId);
      cancelLongPress();
      drag = null;
      rimDrag = null;
      panFrom = null;
      pinch = null;
      drawPendingArrow();
    }),
    on(
      root as unknown as HTMLElement,
      'wheel',
      (event) => {
        const e = event as WheelEvent;
        e.preventDefault();
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
    // Keyboard reaches the same actions as touch, for anyone not using a pointer.
    on(root as unknown as HTMLElement, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      const focused = (e.target as Element).closest?.('.state');
      if ((e.key === 'Enter' || e.key === ' ') && focused) {
        e.preventDefault();
        const id = focused.getAttribute('data-id');
        if (!id) return;
        if (model.mode === 'connect') beginConnect(id);
        else callbacks.onSelectState(id);
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
      el.classList.toggle('is-connect', next.mode === 'connect');
      if (next.mode !== 'connect' && connectFrom !== null) {
        connectFrom = null;
        highlightPendingSource();
      }
    },
    fit,
    zoomBy(factor) {
      zoomAbout(factor, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    },
    resetView,
    destroy() {
      for (const off of cleanups) off();
      cleanups.length = 0;
    },
  };
}
