/**
 * Home: the climb.
 *
 * The campaign used to be a list in four groups. It is now the thing the list
 * was describing: the hierarchy as four floors, finite machines at the bottom
 * and Turing machines at the top, with the forty-two levels as stops on one
 * path up. Each floor is a strictly larger class of machine, and the picture
 * says so before any prose does. The pushdown floor raises a stack beside the
 * path and the Turing floor runs a tape over it. The stack fills as pushdown
 * levels are solved, and solved Turing levels cross cells off the tape.
 *
 * The stops are the buttons the list had, in the same order, with the same
 * names and the same disabled state. A screen reader and the tests still meet
 * 42 labelled buttons. Everything drawn around them is aria-hidden. One stop
 * at a time is in the tab order, the next level by default, and the arrow keys
 * walk the path from there, so the keyboard does not have to pass every level
 * already solved to reach the one being played.
 *
 * A panel beside the map says what the pointed-at stop is and enters it. With
 * nothing pointed at, it shows the next level. On a phone it is pinned under
 * the thumb and keeps only the name and the button.
 */

import { LEVELS, isUnlocked } from '../../../src/engine/levels';
import type { Level, MachineKind } from '../../../src/engine/types';
import { fill, h, on, setText, svg, toggle } from '../dom';
import { notation } from '../notation';
import { setSound, soundOn } from '../sound';
import { game } from '../store';
import { createSettings } from '../components/settings';
import { arriveAt, playCrossing, type Crossing } from '../components/crossing';
import { createMotes } from '../components/motes';
import type { View } from './level';

interface Floor {
  kind: MachineKind;
  /** The class of machine, as the map names the floor. */
  name: string;
  label: string;
  blurb: string;
}

const FLOORS: Floor[] = [
  {
    kind: 'DFA',
    name: 'finite',
    label: 'Deterministic finite automata',
    blurb: 'One arrow per symbol per state. Finite memory, and nothing else.',
  },
  {
    kind: 'NFA',
    name: 'nondeterministic',
    label: 'Nondeterministic finite automata',
    blurb: 'Guessing, and epsilon moves. The same languages, drawn smaller.',
  },
  {
    kind: 'PDA',
    name: 'pushdown',
    label: 'Pushdown automata',
    blurb: 'One unbounded stack. Enough to match nesting, not enough to count twice.',
  },
  {
    kind: 'TM',
    name: 'Turing',
    label: 'Turing machines',
    blurb: 'A tape you can rewrite and walk both ways. Every restriction is gone.',
  },
];

const ORDER = [...LEVELS].sort((a, b) => a.index - b.index);
const pad = (n: number): string => String(n).padStart(2, '0');
const floorOf = (level: Level): Floor =>
  FLOORS.find((f) => f.kind === level.type) ?? (FLOORS[0] as Floor);

/** One stop is one full tap target. */
const STOP = 44;
/** Where a stop's dot sits inside its button, from the button's top edge. */
const DOT_Y = 16;
/** Room along the top of the Turing floor for its tape. */
const TAPE_BAND = 24;

type StopState = 'solved' | 'next' | 'open' | 'locked';

interface Point {
  x: number;
  y: number;
}

interface FloorBox {
  floor: Floor;
  levels: Level[];
  top: number;
  bottom: number;
}

interface Plan {
  width: number;
  height: number;
  narrow: boolean;
  at: Map<string, Point>;
  floors: FloorBox[];
  stack: { x: number; top: number; bottom: number };
  tape: { left: number; right: number; y: number };
}

/**
 * Where everything goes at this width. Floors stack from the bottom up, rows
 * within a floor are balanced (fourteen at a width that holds twelve is two
 * rows of seven, not twelve and two), and the path turns back at the end of
 * every row, so it never has to cross the map.
 */
function plan(width: number): Plan {
  const narrow = width < 560;
  const left = narrow ? 18 : 120;
  const right = narrow ? 42 : 56;
  const rowH = narrow ? 62 : 86;
  const labelH = narrow ? 26 : 0;
  const head = 30;
  const span = Math.max(STOP * 3, width - left - right);
  const perRow = Math.max(4, Math.floor(span / STOP) + 1);
  const step = span / (perRow - 1);

  const at = new Map<string, Point>();
  const boxes: FloorBox[] = [];
  // Measured up from the bottom edge, then flipped.
  let rise = 6;
  let dir = 1;
  for (const floor of FLOORS) {
    const levels = ORDER.filter((l) => l.type === floor.kind);
    const rows = Math.max(1, Math.ceil(levels.length / perRow));
    const per = Math.ceil(levels.length / rows);
    const bottom = rise;
    for (let r = 0; r < rows; r++) {
      const chunk = levels.slice(r * per, (r + 1) * per);
      const w = (chunk.length - 1) * step;
      const x0 = left + (span - w) / 2;
      chunk.forEach((level, k) => {
        at.set(level.id, { x: dir > 0 ? x0 + k * step : x0 + w - k * step, y: rise + rowH / 2 });
      });
      dir = -dir;
      rise += rowH;
    }
    rise += labelH + (floor.kind === 'TM' ? TAPE_BAND : 0);
    boxes.push({ floor, levels, bottom, top: rise });
  }

  const height = Math.ceil(rise + head);
  for (const p of at.values()) p.y = height - p.y;
  for (const b of boxes) {
    b.top = height - b.top;
    b.bottom = height - b.bottom;
  }
  const pda = boxes.find((b) => b.floor.kind === 'PDA');
  const tm = boxes.find((b) => b.floor.kind === 'TM');
  const tapeY = (tm?.top ?? 0) + TAPE_BAND / 2;
  return {
    width,
    height,
    narrow,
    at,
    floors: boxes,
    stack: { x: width - right / 2, bottom: (pda?.bottom ?? height) - 8, top: tapeY + 10 },
    tape: { left: left - 14, right: width - right + 4, y: tapeY },
  };
}

export function createHomeView(navigate: (hash: string) => void): View {
  const solvedCount = h('span', { class: 't-mono-sm', 'data-testid': 'solved-count' });

  // Theme and motion, in a sheet: two three-way choices are more than a
  // button that cycles can say.
  const settings = createSettings();
  const settingsButton = h(
    'button',
    { class: 'ghost', type: 'button', 'data-testid': 'settings-open', 'aria-haspopup': 'dialog' },
    'Settings',
  );
  on(settingsButton, 'click', () => settings.open());

  // The one sound the app makes, and a way to stop it making it.
  const soundButton = h('button', {
    class: 'ghost',
    type: 'button',
    'data-testid': 'sound',
    'aria-pressed': String(soundOn()),
  });
  const paintSound = (): void => {
    setText(soundButton, soundOn() ? 'Sound on' : 'Sound off');
    soundButton.setAttribute('aria-pressed', String(soundOn()));
  };
  paintSound();
  on(soundButton, 'click', () => {
    setSound(!soundOn());
    paintSound();
  });

  // Erasing everything takes two presses, and the second has to come soon.
  const resetButton = h(
    'button',
    { class: 'ghost', type: 'button', 'data-testid': 'reset' },
    'Reset progress',
  );
  let resetArmed = false;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  on(resetButton, 'click', () => {
    if (!resetArmed) {
      resetArmed = true;
      setText(resetButton, 'Tap again to erase everything');
      resetButton.classList.add('fail');
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        resetArmed = false;
        setText(resetButton, 'Reset progress');
        resetButton.classList.remove('fail');
      }, 4000);
      return;
    }
    resetArmed = false;
    setText(resetButton, 'Reset progress');
    resetButton.classList.remove('fail');
    game.resetProgress();
  });

  // -- the map --------------------------------------------------------------

  const art = svg('svg', { class: 'climb-art', 'aria-hidden': 'true', focusable: 'false' });
  const list = h('ol', { class: 'climb-stops', 'aria-label': 'Levels, first to last' });
  const map = h('div', { class: 'climb-map' }, art, list);

  interface Stop {
    level: Level;
    li: HTMLLIElement;
    button: HTMLButtonElement;
    said: HTMLElement;
  }
  const stops = new Map<string, Stop>();
  for (const level of ORDER) {
    const said = h('span', { class: 'visually-hidden' });
    const button = h(
      'button',
      { class: 'level-row', type: 'button', 'data-testid': 'level-row', 'data-level': level.id },
      h('span', { class: 'stop-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'stop-num', 'aria-hidden': 'true' }, pad(level.index)),
      h('span', { class: 'stop-name', 'aria-hidden': 'true' }, level.title),
      said,
    );
    const li = h('li', { class: 'climb-stop' }, button);
    on(button, 'click', () => enter(level));
    on(button, 'focus', () => point(level));
    // A locked stop is a disabled button, which takes no pointer events, so
    // the item around it listens instead.
    on(li, 'pointerenter', () => point(level));
    list.append(li);
    stops.set(level.id, { level, li, button, said });
  }
  on(list, 'pointerleave', () => point(null));
  on(list, 'focusout', (event: FocusEvent) => {
    if (!list.contains(event.relatedTarget as Node | null)) point(null);
  });
  on(list, 'keydown', (event: KeyboardEvent) => walk(event));

  // -- the panel ------------------------------------------------------------

  const pEyebrow = h('p', { class: 't-label climb-eyebrow' });
  const pTitle = h('h2', { class: 't-display climb-title' });
  const pGoal = h('p', { class: 't-body climb-goal' });
  const pSet = h('code', { class: 't-mono-sm sel climb-set' });
  const pStatus = h('p', { class: 't-small climb-status' });
  const pEnter = h('button', { class: 'climb-enter', type: 'button', 'data-testid': 'climb-enter' });
  const pReplay = h(
    'button',
    { class: 'climb-replay', type: 'button', 'data-testid': 'replay-crossing', hidden: true },
    '',
  );
  const pFloor = h('p', { class: 't-small climb-floor-note' });
  const panel = h(
    'aside',
    { class: 'climb-panel', 'data-testid': 'climb-panel' },
    h('div', { class: 'climb-head' }, pEyebrow, pTitle),
    pGoal,
    pSet,
    pStatus,
    h('div', { class: 'climb-actions' }, pReplay, pEnter),
    pFloor,
  );
  // On a phone the panel keeps only a name and a button, so the crossings
  // already seen are offered again under the map instead.
  const replayRow = h(
    'nav',
    { class: 'climb-replays', 'aria-label': 'Crossings seen' },
    h('span', { class: 't-label' }, 'Watch again'),
  );
  const replayButtons = FLOORS.filter(
    (f): f is Floor & { kind: Exclude<MachineKind, 'DFA'> } => f.kind !== 'DFA',
  ).map((floor) => {
    const button = h(
      'button',
      { class: 'ghost', type: 'button', 'data-testid': `replay-${floor.kind}`, hidden: true },
      `Onto ${floor.name}`,
    );
    on(button, 'click', () => replay(floor.kind, button));
    replayRow.append(button);
    return { floor, button };
  });

  let shown: Level | null = null;
  on(pEnter, 'click', () => {
    if (shown) enter(shown);
  });
  on(pReplay, 'click', () => {
    const kind = shown ? floorOf(shown).kind : null;
    if (kind && kind !== 'DFA') replay(kind, pReplay);
  });

  // A name over the stop being pointed at, as the map's own label.
  const tipTitle = h('span', { class: 'climb-tip-t' });
  const tipDetail = h('span', { class: 'climb-tip-d' });
  const tip = h('div', { class: 'climb-tip', 'aria-hidden': 'true', hidden: true }, tipTitle, tipDetail);
  map.append(tip);

  const motes = createMotes();

  const el = h(
    'main',
    { class: 'home climb-scene', 'data-testid': 'home-view' },
    motes.el,
    h(
      'header',
      { class: 'scene-head' },
      h(
        'div',
        { class: 'scene-title' },
        h('h1', { class: 'scene-name' }, 'automata-k'),
        h('p', { class: 'scene-sub' }, 'the climb · ', solvedCount, ' solved'),
        h(
          'p',
          { class: 'scene-tag' },
          'Draw a machine. It is graded against the language, not against an answer key.',
        ),
      ),
      h('div', { class: 'home-meta' }, settingsButton, soundButton, resetButton),
    ),
    replayRow,
    h('section', { class: 'climb', 'aria-label': 'The climb' }, map),
    panel,
  );

  el.append(settings.sheet.el);

  // -- state ----------------------------------------------------------------

  const solved = (level: Level): boolean => game.isSolved(level.id);
  // A level solved from a link is open whatever came before it.
  const enterable = (level: Level): boolean =>
    solved(level) || isUnlocked(level, game.progress.solved);
  const frontier = (): Level | undefined =>
    ORDER.find((level) => enterable(level) && !solved(level));
  const stateOf = (level: Level, next: Level | undefined): StopState =>
    solved(level) ? 'solved' : level === next ? 'next' : enterable(level) ? 'open' : 'locked';
  const reached = (kind: MachineKind): boolean =>
    ORDER.some((level) => level.type === kind && enterable(level));

  function statusOf(level: Level): string {
    const best = game.progress.bestStates[level.id];
    // An unsolved level with work saved on it used to read exactly like an
    // untouched one, so opening it and meeting your own half finished machine
    // came as a surprise. Say so here instead.
    const drawn = game.machineFor(level.id).states.length;
    if (solved(level)) {
      return `${best ?? level.par} states, par ${level.par}${game.wasShown(level.id) ? ', shown' : ''}`;
    }
    if (!enterable(level)) return 'Locked';
    return drawn > 0
      ? `${drawn} state${drawn === 1 ? '' : 's'} drawn, par ${level.par}`
      : `par ${level.par}`;
  }

  // -- entering ---------------------------------------------------------------

  let crossing: Crossing | null = null;

  function enter(level: Level): void {
    if (!enterable(level) || crossing) return;
    crossing = arriveAt(level, el, () => {
      crossing = null;
      navigate(`#/level/${level.id}`);
    });
  }

  function replay(kind: Exclude<MachineKind, 'DFA'>, from: HTMLElement): void {
    if (crossing) return;
    crossing = playCrossing(kind, el, {
      mode: 'replay',
      onDone: () => {
        crossing = null;
        from.focus({ preventScroll: true });
      },
    });
  }

  // -- pointing ---------------------------------------------------------------

  let pointed: Level | null = null;

  function point(level: Level | null): void {
    if (pointed === level) return;
    pointed = level;
    for (const stop of stops.values()) toggle(stop.li, 'is-pointed', stop.level === level);
    paintPanel();
    paintTip();
  }

  function paintTip(): void {
    const at = pointed && current ? current.at.get(pointed.id) : undefined;
    tip.hidden = !pointed || !at;
    if (!pointed || !at || !current) return;
    const state = stateOf(pointed, frontier());
    setText(tipTitle, `L${pad(pointed.index)} · ${pointed.title}`);
    setText(
      tipDetail,
      `${floorOf(pointed).name} · ${state === 'next' ? 'next' : state} · par ${pointed.par}`,
    );
    const x = Math.max(90, Math.min(current.width - 90, at.x));
    tip.style.left = `${x}px`;
    tip.style.top = `${at.y}px`;
  }

  /** The arrow keys follow the path, which is the order the levels are played in. */
  function walk(event: KeyboardEvent): void {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const open = ORDER.filter(enterable);
    const at = open.findIndex((level) => stops.get(level.id)?.button === document.activeElement);
    if (at < 0) return;
    let to = at;
    if (event.key in keys) to = at + (keys[event.key] ?? 0);
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = open.length - 1;
    else return;
    event.preventDefault();
    const target = open[Math.max(0, Math.min(open.length - 1, to))];
    if (!target) return;
    rove(target);
    stops.get(target.id)?.button.focus();
  }

  /** Exactly one stop takes Tab. */
  function rove(level: Level | undefined): void {
    for (const stop of stops.values()) {
      stop.button.tabIndex = stop.level === level ? 0 : -1;
    }
  }

  // -- painting ---------------------------------------------------------------

  function paintStops(next: Level | undefined): void {
    for (const stop of stops.values()) {
      const { level, button, said } = stop;
      const state = stateOf(level, next);
      button.className = `level-row is-${state}${game.wasShown(level.id) ? ' is-shown' : ''}`;
      button.disabled = state === 'locked';
      setText(said, `Level ${level.index}, ${level.title}. ${statusOf(level)}.`);
    }
    const focused = ORDER.find((level) => stops.get(level.id)?.button === document.activeElement);
    rove(focused ?? next ?? ORDER.filter(enterable).at(-1));
  }

  function paintPanel(): void {
    const next = frontier();
    const level = pointed ?? next ?? ORDER.at(-1);
    if (!level) return;
    shown = level;
    const floor = floorOf(level);
    const state = stateOf(level, next);
    setText(pEyebrow, `L${pad(level.index)} · ${floor.label}`);
    setText(pTitle, level.title);
    setText(pGoal, level.goal);
    fill(pSet, notation(level.setBuilder));
    setText(pStatus, panelStatus(level, state));
    panel.dataset.state = state;
    setText(
      pEnter,
      state === 'next' ? 'Continue' : state === 'solved' ? 'Play again' : state === 'open' ? 'Enter' : 'Locked',
    );
    pEnter.disabled = state === 'locked';
    pEnter.setAttribute(
      'aria-label',
      state === 'locked' ? `Level ${level.index} is locked` : `${pEnter.textContent} level ${level.index}, ${level.title}`,
    );
    const kind = floor.kind;
    const canReplay = kind !== 'DFA' && game.hasCrossed(kind);
    pReplay.hidden = !canReplay;
    if (canReplay) setText(pReplay, `Watch the crossing into ${floor.name} again`);
    setText(pFloor, `${floor.label}. ${floor.blurb}`);
  }

  function panelStatus(level: Level, state: StopState): string {
    if (state === 'locked') return `Locked. It opens once L${pad(level.index - 1)} is solved.`;
    if (state === 'solved') {
      const best = game.progress.bestStates[level.id] ?? level.par;
      const shownNote = game.wasShown(level.id) ? ' You were shown the answer.' : '';
      return `Solved with ${best} state${best === 1 ? '' : 's'}, par ${level.par}.${shownNote}`;
    }
    const drawn = game.machineFor(level.id).states.length;
    const lead = state === 'next' ? 'Next. ' : '';
    return drawn > 0
      ? `${lead}${drawn} state${drawn === 1 ? '' : 's'} drawn so far, par ${level.par}.`
      : `${lead}Par ${level.par}.`;
  }

  let current: Plan | null = null;

  function relayout(): void {
    const width = Math.round(map.clientWidth);
    if (width <= 0) return;
    if (current && current.width === width) return;
    current = plan(width);
    map.style.height = `${current.height}px`;
    for (const stop of stops.values()) {
      const p = current.at.get(stop.level.id);
      if (!p) continue;
      stop.li.style.left = `${p.x - STOP / 2}px`;
      stop.li.style.top = `${p.y - DOT_Y}px`;
      // The next level's name rises above its stop. Near an edge it hangs
      // inward instead of off the map.
      toggle(stop.li, 'is-start', p.x < 96);
      toggle(stop.li, 'is-end', p.x > width - 96);
    }
    paintArt(frontier());
  }

  function paintArt(next: Level | undefined): void {
    const p = current;
    if (!p) return;
    art.setAttribute('viewBox', `0 0 ${p.width} ${p.height}`);
    art.setAttribute('width', String(p.width));
    art.setAttribute('height', String(p.height));
    const parts: SVGElement[] = [];

    for (const box of p.floors) {
      const { floor } = box;
      const done = box.levels.filter(solved).length;
      const g = svg('g', { class: `climb-floor${reached(floor.kind) ? ' is-reached' : ''}` });
      g.append(
        svg('line', {
          class: 'climb-ground',
          x1: 0,
          x2: p.width,
          y1: box.bottom + 0.5,
          y2: box.bottom + 0.5,
        }),
      );
      const count = `${floor.name} · ${done} of ${box.levels.length}`;
      if (p.narrow) {
        const y = box.top + (floor.kind === 'TM' ? TAPE_BAND : 0) + 17;
        g.append(
          svg(
            'text',
            { class: 'climb-name', x: 0, y },
            svg('tspan', { class: 'climb-kind' }, floor.kind),
            ` · ${count}`,
          ),
        );
      } else {
        const mid = (box.top + (floor.kind === 'TM' ? TAPE_BAND : 0) + box.bottom) / 2;
        g.append(
          svg('text', { class: 'climb-kind', x: 0, y: mid - 1 }, floor.kind),
          svg('text', { class: 'climb-name', x: 0, y: mid + 16 }, count),
        );
      }
      parts.push(g);
    }

    // The path, solid where it has been walked.
    for (let i = 1; i < ORDER.length; i++) {
      const from = ORDER[i - 1];
      const to = ORDER[i];
      if (!from || !to) continue;
      const a = p.at.get(from.id);
      const b = p.at.get(to.id);
      if (!a || !b) continue;
      const kind = solved(to) && solved(from) ? ' is-done' : to === next ? ' is-next' : '';
      parts.push(svg('line', { class: `climb-path${kind}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }

    parts.push(paintStack(p, next), paintTape(p, next));
    fill(art, ...parts);
  }

  /** Twelve pushdown levels, twelve cells over the bottom marker. One fills per level solved. */
  function paintStack(p: Plan, next: Level | undefined): SVGElement {
    const levels = ORDER.filter((l) => l.type === 'PDA');
    const lit = reached('PDA');
    const cells = levels.length + 1;
    const gap = 3;
    const cellH = Math.max(5, Math.min(11, (p.stack.bottom - p.stack.top - gap * (cells - 1)) / cells));
    const cellW = p.narrow ? 13 : 15;
    const g = svg('g', { class: `climb-stack${lit ? ' is-lit' : ''}` });
    const railY = p.stack.bottom + 2;
    const topY = p.stack.bottom - cells * (cellH + gap) - 2;
    for (const side of [-1, 1]) {
      const x = p.stack.x + side * (cellW / 2 + 4);
      g.append(svg('line', { class: 'stack-rail', x1: x, x2: x, y1: railY, y2: topY }));
    }
    const filled = lit ? 1 + levels.filter(solved).length : 0;
    for (let k = 0; k < cells; k++) {
      const y = p.stack.bottom - (k + 1) * cellH - k * gap;
      const cls = k === 0 ? 'stack-cell is-base' : 'stack-cell';
      const on = k < filled ? ' is-on' : '';
      const top = lit && k === filled - 1 && next?.type === 'PDA' ? ' is-top' : '';
      g.append(
        svg('rect', {
          class: cls + on + top,
          x: p.stack.x - cellW / 2,
          y,
          width: cellW,
          height: cellH,
          rx: 2,
        }),
      );
    }
    return g;
  }

  /** A tape over the Turing floor. Each solved level crosses off the cell above it. */
  function paintTape(p: Plan, next: Level | undefined): SVGElement {
    const lit = reached('TM');
    const pitch = 16;
    const cellW = pitch - 3;
    const cellH = 13;
    const g = svg('g', { class: `climb-tape${lit ? ' is-lit' : ''}` });
    const count = Math.max(1, Math.floor((p.tape.right - p.tape.left) / pitch));
    const left = p.tape.left + (p.tape.right - p.tape.left - count * pitch) / 2;
    const cellAt = (x: number): number =>
      Math.max(0, Math.min(count - 1, Math.floor((x - left) / pitch)));
    const crossed = new Set<number>();
    let head: number | null = null;
    for (const level of ORDER.filter((l) => l.type === 'TM')) {
      const x = p.at.get(level.id)?.x;
      if (x === undefined) continue;
      if (solved(level)) crossed.add(cellAt(x));
      if (level === next) head = cellAt(x);
    }
    for (let k = 0; k < count; k++) {
      const x = left + k * pitch;
      const y = p.tape.y - cellH / 2;
      const isCrossed = lit && crossed.has(k);
      g.append(
        svg('rect', {
          class: `tape-cell${isCrossed ? ' is-crossed' : ''}`,
          x,
          y,
          width: cellW,
          height: cellH,
          rx: 2,
        }),
      );
      if (isCrossed) {
        g.append(
          svg('path', {
            class: 'tape-x',
            d: `M${x + 3.5} ${y + 3.5}l${cellW - 7} ${cellH - 7}M${x + cellW - 3.5} ${y + 3.5}l${-(cellW - 7)} ${cellH - 7}`,
          }),
        );
      }
    }
    if (lit && head !== null) {
      const hx = left + head * pitch + cellW / 2;
      const hy = p.tape.y - cellH / 2 - 2;
      g.append(svg('path', { class: 'tape-head', d: `M${hx} ${hy}l-4.5 -6h9z` }));
    }
    return g;
  }

  function render(): void {
    setText(solvedCount, `${game.progress.solved.length}/${LEVELS.length}`);
    for (const { floor, button } of replayButtons) button.hidden = !game.hasCrossed(floor.kind);
    replayRow.hidden = replayButtons.every(({ button }) => button.hidden);
    const next = frontier();
    paintStops(next);
    paintPanel();
    paintArt(next);
  }

  // The map is laid out from its own width, so it follows the panel moving
  // beside it or under it as well as the window.
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => relayout());
  observer?.observe(map);
  const offResize = observer ? () => undefined : on(window, 'resize', () => relayout());

  const unsubscribe = game.subscribe(render);
  render();
  requestAnimationFrame(() => relayout());
  document.title = 'automata-k';

  return {
    el,
    destroy() {
      unsubscribe();
      motes.destroy();
      observer?.disconnect();
      offResize();
      crossing?.destroy();
      if (resetTimer) clearTimeout(resetTimer);
      settings.sheet.destroy();
    },
  };
}
