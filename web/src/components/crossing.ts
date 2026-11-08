/**
 * The crossings.
 *
 * Three times on the climb the machine changes kind, and each change is the
 * point of everything before it: a finite automaton learns to guess, a finite
 * machine is given a stack, and the stack is traded for a tape. The first time
 * a player steps onto one of those floors from inside the game, a short scene
 * says what the new machine can do that the old one could not, and shows it
 * doing it, one step at a time, in the words the trace uses for a rule.
 *
 * A crossing plays once per floor, can be skipped from its first frame, and
 * can be watched again from the climb. It never plays on a link opened from
 * outside the game: a shared URL means "show me this level", not "show me a
 * film first". With reduced motion it is the same scene, all at once.
 *
 * It is a native modal dialog, so focus, Escape and the inert page behind it
 * come from the browser rather than from code here. The typed lines are
 * decoration over a plain transcript that the dialog is described by.
 */

import type { Level, MachineKind } from '../../../src/engine/types';
import { h, on, setText, svg, toggle } from '../dom';
import { reducedMotion } from '../haptics';
import { game } from '../store';

export type Floor = Exclude<MachineKind, 'DFA'>;

export interface Crossing {
  /** Take the scene down without counting it as watched. */
  destroy(): void;
}

interface Line {
  /** Seconds from the start. */
  at: number;
  text: string;
  big?: boolean;
}

interface Demo {
  el: Element;
  /** The index of the last step. */
  last: number;
  /** Show step `step`; `stepped` is true when it follows the step shown before. */
  show(step: number, stepped: boolean): void;
}

interface Scene {
  eyebrow: string;
  title: string;
  lines: Line[];
  /** When the demonstration starts, and how long each of its steps lasts. */
  demoAt: number;
  every: number;
  /** When the way on appears. */
  end: number;
  demo(): Demo;
}

/** Seconds per typed character. */
const CHAR = 0.017;

// -- the demonstrations -------------------------------------------------------

function symbols(text: readonly string[]): { el: HTMLElement; show(read: number, done: boolean): void } {
  const cells = text.map((c) => h('span', { class: 'demo-sym' }, c));
  const el = h('div', { class: 'demo-input' }, h('span', { class: 't-label' }, 'Input'), ...cells);
  return {
    el,
    show(read, done) {
      cells.forEach((cell, i) => {
        toggle(cell, 'is-read', i < read - 1 || (done && i < read));
        toggle(cell, 'is-reading', !done && i === read - 1);
      });
    },
  };
}

/**
 * Three states that accept every string containing 11. Reading 011 lights
 * one state, then two, then all three: the set of everywhere it could be.
 */
function guessing(): Demo {
  const input = symbols(['0', '1', '1']);
  const caption = h('p', { class: 'demo-caption' });
  const X = [56, 160, 264] as const;
  const [x0, x1, x2] = X;
  const Y = 104;
  const R = 19;
  const marker = `crossing-arrow-${Math.random().toString(36).slice(2, 8)}`;
  const head = (id: string, cls: string): SVGMarkerElement =>
    svg(
      'marker',
      {
        id,
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: 'auto-start-reverse',
      },
      svg('path', { d: 'M0 0L10 5L0 10z', class: cls }),
    );
  const arrow = (d: string, id: string): SVGPathElement =>
    svg('path', { class: 'demo-edge', d, 'data-edge': id, 'marker-end': `url(#${marker})` });
  const label = (x: number, y: number, text: string): SVGTextElement =>
    svg('text', { class: 'demo-edge-label', x, y }, text);
  const loop = (x: number): string =>
    `M${x - 11} ${Y - R + 3}C${x - 34} ${Y - 66} ${x + 34} ${Y - 66} ${x + 11} ${Y - R + 3}`;
  const across = (from: number, to: number): string => `M${from + R + 2} ${Y}H${to - R - 3}`;
  const states = X.map((x, i) =>
    svg(
      'g',
      { class: `demo-state${i === 2 ? ' is-accepting' : ''}`, 'data-state': `q${i}` },
      svg('circle', { class: 'demo-halo', cx: x, cy: Y, r: R + 10 }),
      svg('circle', { class: 'demo-ring', cx: x, cy: Y, r: R }),
      i === 2 ? svg('circle', { class: 'demo-ring is-inner', cx: x, cy: Y, r: R - 4.5 }) : null,
      svg('text', { class: 'demo-state-label', x, y: Y + 4.5 }, `q${i}`),
    ),
  );
  const figure = svg(
    'svg',
    { class: 'demo-figure', viewBox: '0 0 320 140', width: 320, height: 140 },
    svg(
      'defs',
      {},
      head(marker, 'demo-arrowhead'),
      head(`${marker}-fired`, 'demo-arrowhead is-fired'),
    ),
    arrow(`M8 ${Y}H${x0 - R - 2}`, 'start'),
    arrow(loop(x0), 'q0q0'),
    label(x0, Y - 58, '0,1'),
    arrow(across(x0, x1), 'q0q1'),
    label((x0 + x1) / 2, Y - 8, '1'),
    arrow(across(x1, x2), 'q1q2'),
    label((x1 + x2) / 2, Y - 8, '1'),
    arrow(loop(x2), 'q2q2'),
    label(x2, Y - 58, '0,1'),
    ...states,
  );

  const STEPS: { on: number[]; fired: string[]; say: string }[] = [
    { on: [0], fired: ['start'], say: 'it starts in q0' },
    { on: [0], fired: ['q0q0'], say: 'read 0 · from q0 the only way is back to q0' },
    { on: [0, 1], fired: ['q0q0', 'q0q1'], say: 'read 1 · stay in q0, or go on to q1. it does both' },
    { on: [0, 1, 2], fired: ['q0q0', 'q0q1', 'q1q2'], say: 'read 1 · now it is in q0, q1 and q2 at once' },
    { on: [0, 1, 2], fired: [], say: 'q2 accepts, so 011 is accepted' },
  ];
  const edges = [...figure.querySelectorAll<SVGPathElement>('.demo-edge')];
  const el = h('div', { class: 'demo demo-nfa' }, input.el, figure, caption);
  return {
    el,
    last: STEPS.length - 1,
    show(step) {
      const s = STEPS[step];
      if (!s) return;
      const done = step === STEPS.length - 1;
      input.show(Math.min(step, 3), done);
      states.forEach((g, i) => {
        toggle(g, 'is-on', s.on.includes(i));
        toggle(g, 'is-verdict', done && i === 2);
      });
      for (const e of edges) {
        const fired = s.fired.includes(e.dataset.edge ?? '');
        toggle(e, 'is-fired', fired);
        e.setAttribute('marker-end', `url(#${marker}${fired ? '-fired' : ''})`);
      }
      setText(caption, s.say);
      toggle(caption, 'is-verdict', done);
    },
  };
}

/** One state and a stack, checking (()) one push and one pop at a time. */
function stacking(): Demo {
  const input = symbols(['(', '(', ')', ')']);
  const caption = h('p', { class: 'demo-caption' });
  const stack = h('div', { class: 'demo-stack' });
  const state = h('div', { class: 'demo-q' }, 'q');
  const el = h(
    'div',
    { class: 'demo demo-pda' },
    input.el,
    h(
      'div',
      { class: 'demo-pda-row' },
      state,
      h('div', { class: 'demo-stack-col' }, h('span', { class: 't-label' }, 'Stack'), stack),
      h('p', { class: 'demo-note' }, '$ marks the bottom'),
    ),
    caption,
  );
  const STEPS: { depth: number; say: string }[] = [
    { depth: 0, say: 'the stack starts with $ on it' },
    { depth: 1, say: 'read ( · put X on top' },
    { depth: 2, say: 'read ( · put X on top' },
    { depth: 1, say: 'read ) · take X off the top' },
    { depth: 0, say: 'read ) · take X off the top' },
    { depth: 0, say: 'only $ is left, so every ( was closed' },
  ];
  let shownDepth = -1;
  return {
    el,
    last: STEPS.length - 1,
    show(step, stepped) {
      const s = STEPS[step];
      if (!s) return;
      const done = step === STEPS.length - 1;
      input.show(Math.min(step, 4), done);
      const cells = [h('span', { class: 'demo-cell is-base' }, '$')];
      for (let i = 0; i < s.depth; i++) cells.push(h('span', { class: 'demo-cell' }, 'X'));
      const top = cells[cells.length - 1];
      if (stepped && s.depth > shownDepth && top) top.classList.add('is-new');
      if (stepped && s.depth < shownDepth) {
        cells.push(h('span', { class: 'demo-cell is-gone', 'aria-hidden': 'true' }, 'X'));
      }
      stack.replaceChildren(...cells);
      shownDepth = s.depth;
      toggle(cells[0] as HTMLElement, 'is-verdict', done);
      toggle(state, 'is-on', step > 0 && !done);
      toggle(state, 'is-verdict', done);
      setText(caption, s.say);
      toggle(caption, 'is-verdict', done);
    },
  };
}

/** A tape and a head, crossing off an a for every b in aabb. */
function taping(): Demo {
  const caption = h('p', { class: 'demo-caption' });
  const BLANK = '⊔';
  const width = 6;
  const cells = Array.from({ length: width }, () => h('span', { class: 'demo-cell' }));
  const head = h('span', { class: 'demo-head' }, '▼');
  const tape = h('div', { class: 'demo-tape' }, ...cells);
  const el = h(
    'div',
    { class: 'demo demo-tm' },
    h('div', { class: 'demo-tape-wrap' }, head, tape),
    caption,
  );
  const STEPS: { tape: string; at: number; say: string }[] = [
    { tape: 'aabb', at: 0, say: 'the head starts on the first cell' },
    { tape: 'Xabb', at: 1, say: 'read a · write X · move right' },
    { tape: 'Xabb', at: 2, say: 'read a · leave it · move right' },
    { tape: 'XaYb', at: 1, say: 'read b · write Y · move left' },
    { tape: 'XaYb', at: 0, say: 'read a · leave it · move left' },
    { tape: 'XaYb', at: 1, say: 'read X · move right' },
    { tape: 'XXYb', at: 2, say: 'read a · write X · move right' },
    { tape: 'XXYb', at: 3, say: 'read Y · leave it · move right' },
    { tape: 'XXYY', at: 2, say: 'read b · write Y · move left' },
    { tape: 'XXYY', at: 1, say: 'read Y · leave it · move left' },
    { tape: 'XXYY', at: 2, say: 'read X · move right' },
    { tape: 'XXYY', at: 3, say: 'no a is left · read Y · move right' },
    { tape: 'XXYY', at: 4, say: 'read Y · move right' },
    { tape: 'XXYY', at: 4, say: 'read ⊔ · every a had its b, so aabb is accepted' },
  ];
  let before = '';
  return {
    el,
    last: STEPS.length - 1,
    show(step, stepped) {
      const s = STEPS[step];
      if (!s) return;
      const done = step === STEPS.length - 1;
      const text = s.tape.padEnd(width, BLANK);
      cells.forEach((cell, i) => {
        const c = text[i] ?? BLANK;
        const changed = stepped && before !== '' && before[i] !== c;
        setText(cell, c);
        toggle(cell, 'is-blank', c === BLANK);
        toggle(cell, 'is-crossed', c === 'X' || c === 'Y');
        toggle(cell, 'is-under', i === s.at);
        cell.classList.remove('is-new');
        if (changed) {
          // Restart the write's flash even if the same cell flashed last step.
          void cell.offsetWidth;
          cell.classList.add('is-new');
        }
      });
      before = text;
      head.style.setProperty('--at', String(s.at));
      toggle(head, 'is-verdict', done);
      setText(caption, s.say);
      toggle(caption, 'is-verdict', done);
    },
  };
}

const SCENES: Record<Floor, Scene> = {
  NFA: {
    eyebrow: 'Crossing onto the nondeterministic floor',
    title: 'A machine that guesses',
    lines: [
      { at: 0.3, text: '> a DFA is always in exactly one state, with one arrow to follow for each symbol.' },
      { at: 2.0, text: '> an NFA may have two arrows for the same symbol, or none, or an ε arrow it takes without reading anything.' },
      { at: 4.2, text: '> it does not choose. it takes every arrow at once.', big: true },
      { at: 5.4, text: '> below, lit: every state it could be in, after each symbol of 011.' },
      { at: 11.0, text: '> it accepts if any one of them is accepting.' },
      { at: 12.2, text: '> every NFA has a DFA that accepts the same strings, but that DFA can need exponentially more states. guessing buys size, not power.' },
    ],
    demoAt: 6.2,
    every: 1.1,
    end: 15.2,
    demo: guessing,
  },
  PDA: {
    eyebrow: 'Crossing onto the pushdown floor',
    title: 'A machine with a stack',
    lines: [
      { at: 0.3, text: '> a finite automaton remembers only which state it is in.' },
      { at: 1.8, text: '> to check (( )) it would need a separate state for each level of nesting.' },
      { at: 3.4, text: '> nesting has no limit. its states do.' },
      { at: 4.5, text: '> so give it a stack.', big: true },
      { at: 5.4, text: '> on every ( it puts an X on top. on every ) it takes one off.' },
      { at: 11.0, text: '> if only $ is left at the end, every ( was closed.' },
      { at: 12.2, text: '> a state machine with a stack is a pushdown automaton. it can match nesting to any depth.' },
    ],
    demoAt: 6.4,
    every: 0.9,
    end: 14.4,
    demo: stacking,
  },
  TM: {
    eyebrow: 'Crossing onto the Turing floor',
    title: 'A machine with a tape',
    lines: [
      { at: 0.3, text: '> a stack is read from the top, and what comes off it is gone.' },
      { at: 1.8, text: "> so a pushdown automaton can check n a's then n b's, but add n c's and it cannot: matching the b's used up what the a's put on the stack." },
      { at: 4.6, text: '> give it a tape instead.', big: true },
      { at: 5.6, text: '> the head reads a cell, may write over it, and moves one cell left or right. nothing is used up.' },
      { at: 7.4, text: '> here it checks aabb: cross off an a, cross off a b, walk back, again.' },
      { at: 15.0, text: '> two stacks back to back can do everything a tape can.' },
      { at: 16.2, text: '> this is a Turing machine. as far as anyone knows, nothing computes more.' },
    ],
    demoAt: 8.6,
    every: 0.45,
    end: 17.8,
    demo: taping,
  },
};

/** The floor a level belongs to, if stepping onto it is a crossing. */
export const crossingFor = (level: Level): Floor | null =>
  level.type === 'DFA' ? null : level.type;

/**
 * Go to `level`, by way of its floor's crossing if the player has not seen it.
 * Calls `go` at once, and returns null, when there is nothing to show.
 */
export function arriveAt(level: Level, host: HTMLElement, go: () => void): Crossing | null {
  const kind = crossingFor(level);
  if (!kind || game.hasCrossed(kind)) {
    go();
    return null;
  }
  return playCrossing(kind, host, {
    mode: 'arrive',
    level,
    onDone: () => {
      game.markCrossed(kind);
      go();
    },
  });
}

export function playCrossing(
  kind: Floor,
  host: HTMLElement,
  opts: { mode: 'arrive' | 'replay'; level?: Level; onDone: () => void },
): Crossing {
  const scene = SCENES[kind];
  const still = reducedMotion();
  const demo = scene.demo();
  const id = `crossing-${kind.toLowerCase()}`;

  // Each line is laid out at full length from the start, invisibly, and typed
  // over itself, so nothing below it moves while it types.
  const lines = scene.lines.map((line) => {
    const typed = h('span', { class: 'crossing-typed' });
    const p = h(
      'p',
      { class: `crossing-line${line.big ? ' is-big' : ''}` },
      h('span', { class: 'crossing-ghost' }, line.text),
      typed,
    );
    return { p, typed };
  });
  const stage = h('div', { class: 'crossing-stage', 'aria-hidden': 'true' }, demo.el);
  const transcript = h(
    'div',
    { class: 'visually-hidden', id: `${id}-said` },
    ...scene.lines.map((line) => h('p', {}, line.text.replace(/^> /, ''))),
  );
  const skip = h(
    'button',
    { class: 'ghost crossing-skip', type: 'button', 'data-testid': 'crossing-skip' },
    opts.mode === 'arrive' ? 'Skip' : 'Close',
  );
  const onward = h(
    'button',
    { class: 'crossing-go', type: 'button', 'data-testid': 'crossing-continue', hidden: true },
    opts.mode === 'arrive' && opts.level ? `Enter level ${opts.level.index}` : 'Back to the climb',
  );
  const dialog = h(
    'dialog',
    {
      class: 'crossing',
      'data-testid': 'crossing',
      'data-kind': kind,
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-said`,
    },
    h(
      'div',
      { class: 'crossing-inner' },
      h('p', { class: 't-label crossing-eyebrow' }, scene.eyebrow),
      h('h2', { class: 't-display crossing-title', id: `${id}-title` }, scene.title),
      h('div', { class: 'crossing-lines', 'aria-hidden': 'true' }, ...lines.map((l) => l.p)),
      stage,
      transcript,
      h('div', { class: 'crossing-actions' }, skip, onward),
    ),
  );

  host.append(dialog);
  dialog.showModal();
  skip.focus({ preventScroll: true });

  let t0 = performance.now();
  let raf = 0;
  let ended = false;
  let finished = false;
  let lastStep = -1;
  const typed: string[] = scene.lines.map(() => '');

  function paint(e: number): void {
    let latest = -1;
    scene.lines.forEach((line, i) => {
      if (e >= line.at) latest = i;
    });
    scene.lines.forEach((line, i) => {
      const n = e < line.at ? 0 : Math.min(line.text.length, Math.floor((e - line.at) / CHAR));
      const typing = n > 0 && n < line.text.length;
      const key = `${n}${typing ? '+' : ''}`;
      const node = lines[i];
      if (!node) return;
      toggle(node.p, 'is-past', i < latest);
      toggle(node.p, 'is-started', n > 0);
      if (typed[i] === key) return;
      typed[i] = key;
      node.typed.textContent = line.text.slice(0, n);
      if (typing) node.typed.append(h('span', { class: 'crossing-cursor' }, '▌'));
    });
    toggle(stage, 'is-on', e >= scene.demoAt - 0.5);
    const step =
      e < scene.demoAt ? 0 : Math.min(demo.last, Math.floor((e - scene.demoAt) / scene.every));
    if (step !== lastStep) {
      demo.show(step, step === lastStep + 1 && !still);
      lastStep = step;
    }
    if (e >= scene.end && !ended) end();
  }

  function end(): void {
    ended = true;
    cancelAnimationFrame(raf);
    skip.hidden = true;
    onward.hidden = false;
    onward.focus({ preventScroll: true });
  }

  function frame(): void {
    paint((performance.now() - t0) / 1000);
    if (!ended) raf = requestAnimationFrame(frame);
  }

  function close(): void {
    cancelAnimationFrame(raf);
    offs.forEach((off) => off());
    if (dialog.open) dialog.close();
    dialog.remove();
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    close();
    opts.onDone();
  }

  const offs = [
    on(skip, 'click', finish),
    on(onward, 'click', finish),
    // Escape is the browser's own way out of a modal dialog. It means the
    // same as Skip.
    on(dialog, 'cancel', (event: Event) => {
      event.preventDefault();
      finish();
    }),
  ];

  if (still) {
    paint(Number.POSITIVE_INFINITY);
  } else {
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  return {
    destroy() {
      if (finished) return;
      finished = true;
      close();
    },
  };
}
