/**
 * Four complete interface directions, rendered at fidelity.
 *
 * The current interface was rejected for concrete reasons: eight equal weight
 * buttons in a dock, every panel expanded at once, the plain English puzzle
 * demoted to a subtitle, and the drawing tools living away from the drawing.
 * Tweaking it would only move those problems around, so this puts four
 * different answers side by side and lets one be chosen.
 *
 * The diagrams are not drawings of diagrams. They come out of the real
 * geometry in src/ui/geometry.ts, on the real verified solution, so what is on
 * screen here is what the product would draw.
 *
 *     npx vite-node scripts/build-ui-study.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LEVEL_BY_ID } from '../src/engine/levels';
import { deltaLines, transitionChip } from '../src/engine/formal';
import { SOLUTIONS } from '../src/engine/solutions';
import type { Level, Machine } from '../src/engine/types';
import {
  CHIP_CHAR_W,
  CHIP_PAD_X,
  CHIP_ROW_HEIGHT,
  STATE_RADIUS,
  buildEdges,
  chipAnchor,
  edgesPathData,
} from '../src/ui/geometry';
import type { Positions } from '../src/ui/geometry';

const ROOT = join(import.meta.dirname, '..');
const OUT =
  '/tmp/claude-0/-home-user-automata-k/6f93d79c-cf5c-5528-8236-9adda4274db4/scratchpad/ui-study.html';
const EXTRA_FONTS =
  '/tmp/claude-0/-home-user-automata-k/6f93d79c-cf5c-5528-8236-9adda4274db4/scratchpad/studyfonts';

// ---------------------------------------------------------------------------
// the subject
// ---------------------------------------------------------------------------

const LEVEL = LEVEL_BY_ID['dfa-contains-01'] as Level;
const MACHINE = SOLUTIONS['dfa-contains-01'] as Machine;

/** A machine one rule short of correct, for showing how failure reads. */
const BROKEN: Machine = {
  ...MACHINE,
  transitions: MACHINE.transitions.filter((t) => !(t.from === 'q1' && t.read === '0')),
};

const ACCEPTED = LEVEL.tests.filter((w) => LEVEL.accepts(w));
const REJECTED = LEVEL.tests.filter((w) => !LEVEL.accepts(w));
const EPS = 'ε';
const show = (w: string): string => (w === '' ? EPS : w);

const DELTA = deltaLines(MACHINE, LEVEL);

// ---------------------------------------------------------------------------
// the diagram, from the real geometry
// ---------------------------------------------------------------------------

interface DiagramOptions {
  /** States drawn filled, as the trace player draws the live set. */
  active?: string[];
  /** Transitions drawn lit. */
  lit?: string[];
  /** Extra padding around the content, in canvas units. */
  pad?: number;
  className?: string;
}

function diagram(machine: Machine, options: DiagramOptions = {}): string {
  const { active = [], lit = [], pad = 46, className = '' } = options;
  const positions: Positions = Object.fromEntries(
    machine.states.map((s) => [s.id, { x: s.x, y: s.y }]),
  );
  const edges = buildEdges(
    machine.transitions.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      chip: transitionChip(t, LEVEL.type),
    })),
    machine.start,
  );
  const { strokes, heads } = edgesPathData(edges, positions);

  // Frame the content, chips included.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number, hw: number, hh: number): void => {
    x0 = Math.min(x0, x - hw);
    y0 = Math.min(y0, y - hh);
    x1 = Math.max(x1, x + hw);
    y1 = Math.max(y1, y + hh);
  };
  for (const s of machine.states) grow(s.x, s.y, STATE_RADIUS + 4, STATE_RADIUS + 4);
  if (machine.start) {
    const at = positions[machine.start];
    if (at) grow(at.x - STATE_RADIUS - 26, at.y, 4, 4);
  }

  const chips: string[] = [];
  for (const edge of edges) {
    const anchor = chipAnchor(edge, positions);
    const rows = edge.chips.length;
    const widest = Math.max(...edge.chips.map((c) => c.length));
    grow(
      anchor.x,
      anchor.y,
      (widest * CHIP_CHAR_W) / 2 + CHIP_PAD_X + 2,
      (rows * CHIP_ROW_HEIGHT) / 2 + 2,
    );
    edge.chips.forEach((label, i) => {
      const w = Math.max(22, label.length * CHIP_CHAR_W + CHIP_PAD_X * 2);
      const cy = anchor.y - ((rows - 1) / 2) * CHIP_ROW_HEIGHT + i * CHIP_ROW_HEIGHT;
      const on = lit.includes(edge.transitionIds[i] as string);
      chips.push(
        `<g class="k-chip${on ? ' is-lit' : ''}">` +
          `<rect x="${(anchor.x - w / 2).toFixed(1)}" y="${(cy - 9.5).toFixed(1)}" ` +
          `width="${w.toFixed(1)}" height="19" rx="5"/>` +
          `<text x="${anchor.x.toFixed(1)}" y="${(cy + 0.5).toFixed(1)}" ` +
          `text-anchor="middle" dominant-baseline="middle" font-size="12">${label}</text></g>`,
      );
    });
  }

  const start = machine.start ? positions[machine.start] : undefined;
  const startMarker = start
    ? `<path class="k-start" d="M${(start.x - STATE_RADIUS - 26).toFixed(1)} ${start.y}` +
      `H${(start.x - STATE_RADIUS - 12).toFixed(1)}"/>` +
      `<path class="k-head" d="M${(start.x - STATE_RADIUS - 3).toFixed(1)} ${start.y}` +
      `L${(start.x - STATE_RADIUS - 12.5).toFixed(1)} ${start.y - 5}` +
      `L${(start.x - STATE_RADIUS - 12.5).toFixed(1)} ${start.y + 5}Z"/>`
    : '';

  const states = machine.states
    .map((s) => {
      const accepting = machine.accepting.includes(s.id);
      const on = active.includes(s.id);
      return (
        `<g class="k-state${accepting ? ' is-accepting' : ''}${on ? ' is-active' : ''}" ` +
        `transform="translate(${s.x} ${s.y})">` +
        `<circle class="k-ring" r="${STATE_RADIUS}"/>` +
        (accepting ? `<circle class="k-accept" r="${STATE_RADIUS - 4.5}"/>` : '') +
        `<text class="k-label" y="1" text-anchor="middle" dominant-baseline="middle" ` +
        `font-size="14">${s.label}</text></g>`
      );
    })
    .join('');

  const vb = [
    (x0 - pad).toFixed(1),
    (y0 - pad).toFixed(1),
    (x1 - x0 + pad * 2).toFixed(1),
    (y1 - y0 + pad * 2).toFixed(1),
  ].join(' ');

  return (
    `<svg class="k-diagram ${className}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">` +
    `<path class="k-edge" d="${strokes}"/><path class="k-head" d="${heads}"/>` +
    chips.join('') +
    startMarker +
    states +
    '</svg>'
  );
}

// ---------------------------------------------------------------------------
// small pieces the mockups share
// ---------------------------------------------------------------------------

const icon = (paths: string, size = 16): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
  `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  cursor: '<path d="M5 3l14 8-6 1.5L10 20z"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  arrow: '<path d="M4 18L20 6"/><path d="M20 12V6h-6"/>',
  erase: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12h-2"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12h2"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  tick: '<path d="M4 12.5l5 5L20 6.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
};

/** One row of the accept / reject table, with its live mark. */
const verdictRow = (w: string, ok: boolean): string =>
  `<li class="k-verdict${ok ? '' : ' is-off'}">` +
  `<span class="k-mark">${icon(ok ? ICONS.tick : ICONS.cross, 13)}</span>` +
  `<code>${show(w)}</code></li>`;

const verdictList = (words: string[], allOk = true): string =>
  `<ul class="k-verdicts">${words.map((w) => verdictRow(w, allOk)).join('')}</ul>`;

// ---------------------------------------------------------------------------
// 01 Brief
// ---------------------------------------------------------------------------

function brief(): string {
  return `
<div class="m m-brief">
  <aside class="brief-pane">
    <p class="brief-eyebrow">Level 3 of 12 &middot; Finite automaton</p>
    <h3 class="brief-q">Accept the strings that contain <b>01</b> somewhere inside them.</h3>
    <code class="brief-set">${LEVEL.setBuilder}</code>

    <div class="brief-split">
      <section>
        <p class="brief-h">These must be accepted</p>
        ${verdictList(ACCEPTED)}
      </section>
      <section>
        <p class="brief-h">These must be rejected</p>
        ${verdictList(REJECTED)}
      </section>
    </div>

    <footer class="brief-foot">
      <span class="brief-score">All 12 agree</span>
      <button class="brief-more">The machine as a tuple <span>&rsaquo;</span></button>
    </footer>
  </aside>

  <main class="brief-canvas">
    <div class="brief-tools">
      <button title="Undo">${icon(ICONS.undo, 15)}</button>
      <button title="Redo">${icon(ICONS.redo, 15)}</button>
      <button title="Fit">${icon(ICONS.fit, 15)}</button>
    </div>
    ${diagram(MACHINE, { pad: 40 })}
    <p class="brief-hint">Double click to place a state &middot; drag from a rim to draw an arrow &middot; hold to rename</p>
  </main>
</div>`;
}

// ---------------------------------------------------------------------------
// 02 Worksheet
// ---------------------------------------------------------------------------

function worksheet(): string {
  const deltaRows = DELTA.map(
    (l) => `<tr><td><code>${l.text.split(' = ')[0]}</code></td>` +
      `<td><code>${l.text.split(' = ')[1]}</code></td></tr>`,
  ).join('');

  return `
<div class="m m-sheet">
  <article class="sheet-body">
    <p class="sheet-num">Problem 3</p>
    <h3 class="sheet-q">Accept the strings that contain 01 somewhere inside them.</h3>
    <p class="sheet-formal"><code>${LEVEL.setBuilder}</code></p>

    <figure class="sheet-fig">
      <div class="sheet-rail">
        <button class="is-on" title="Select">${icon(ICONS.cursor, 15)}</button>
        <button title="State">${icon(ICONS.circle, 15)}</button>
        <button title="Arrow">${icon(ICONS.arrow, 15)}</button>
        <button title="Erase">${icon(ICONS.erase, 15)}</button>
      </div>
      ${diagram(MACHINE, { pad: 18 })}
      <figcaption>Figure 1 &mdash; your machine, 3 states</figcaption>
    </figure>

    <div class="sheet-tables">
      <div>
        <p class="sheet-cap">Table 1 &mdash; the transition function</p>
        <table class="sheet-delta"><tbody>${deltaRows}</tbody></table>
      </div>
      <div>
        <p class="sheet-cap">Table 2 &mdash; the marking</p>
        <table class="sheet-tests"><tbody>
          ${LEVEL.tests
            .slice(0, 8)
            .map(
              (w) =>
                `<tr><td><code>${show(w)}</code></td>` +
                `<td class="sheet-want">${LEVEL.accepts(w) ? 'accept' : 'reject'}</td>` +
                `<td class="sheet-got"><span class="k-mark">${icon(ICONS.tick, 12)}</span></td></tr>`,
            )
            .join('')}
          <tr class="sheet-rest"><td colspan="3">and 4 more, all marked</td></tr>
        </tbody></table>
      </div>
    </div>
  </article>

  <aside class="sheet-margin">
    <div class="sheet-note">
      <span class="k-mark big">${icon(ICONS.tick, 18)}</span>
      <p>12 of 12.</p>
    </div>
    <p class="sheet-hand">q2 loops on both symbols, so once 01 is seen it cannot be unseen. That is the whole idea.</p>
    <hr/>
    <p class="sheet-ref">Regular. Type 3.<br/>
      <code>S &rarr; 0S | 1S | 01A</code><br/>
      <code>A &rarr; 0A | 1A | ε</code></p>
    <hr/>
    <p class="sheet-ref muted">Par 3 states. Yours: 3.</p>
  </aside>
</div>`;
}

// ---------------------------------------------------------------------------
// 03 Studio
// ---------------------------------------------------------------------------

function studio(): string {
  const tool = (name: string, key: string, path: string, on = false): string =>
    `<button class="${on ? 'is-on' : ''}" title="${name} (${key})">` +
    `${icon(path, 17)}<kbd>${key}</kbd></button>`;

  return `
<div class="m m-studio">
  <div class="studio-stage">
    <div class="studio-rail">
      ${tool('Select', 'V', ICONS.cursor, true)}
      ${tool('State', 'S', ICONS.circle)}
      ${tool('Arrow', 'A', ICONS.arrow)}
      ${tool('Erase', 'E', ICONS.erase)}
    </div>
    ${diagram(MACHINE, { pad: 44, lit: ['sol3-t3'] })}
  </div>

  <aside class="studio-pane">
    <div class="studio-score">
      <span class="studio-bar"><i style="width:100%"></i></span>
      <span>12 / 12 agree</span>
    </div>
    <nav class="studio-tabs">
      <button class="is-on">Brief</button><button>Rules</button><button>Analysis</button>
    </nav>

    <div class="studio-body">
      <h3 class="studio-q">Accept the strings that contain 01 somewhere inside them.</h3>
      <code class="studio-set">${LEVEL.setBuilder}</code>
      <div class="studio-split">
        <section><p class="studio-h">Accept</p>${verdictList(ACCEPTED)}</section>
        <section><p class="studio-h">Reject</p>${verdictList(REJECTED)}</section>
      </div>
    </div>
  </aside>
</div>

<div class="m m-studio is-alt">
  <div class="studio-stage">
    <div class="studio-rail">
      ${tool('Select', 'V', ICONS.cursor, true)}
      ${tool('State', 'S', ICONS.circle)}
      ${tool('Arrow', 'A', ICONS.arrow)}
      ${tool('Erase', 'E', ICONS.erase)}
    </div>
    ${diagram(MACHINE, { pad: 44, lit: ['sol3-t3'] })}
  </div>

  <aside class="studio-pane">
    <div class="studio-score">
      <span class="studio-bar"><i style="width:100%"></i></span>
      <span>12 / 12 agree</span>
    </div>
    <nav class="studio-tabs">
      <button>Brief</button><button class="is-on">Rules</button><button>Analysis</button>
    </nav>

    <div class="studio-body">
      <p class="studio-sel">Arrow selected</p>
      <p class="studio-rule"><code>q1</code> <span>&rarr;</span> <code>q2</code></p>
      <p class="studio-h">Reads</p>
      <div class="studio-choices"><button>0</button><button class="is-on">1</button></div>
      <p class="studio-h">Every rule</p>
      <ul class="studio-delta">
        ${DELTA.map(
          (l, i) =>
            `<li${i === 3 ? ' class="is-on"' : ''}><code>${l.text}</code></li>`,
        ).join('')}
      </ul>
      <button class="studio-danger">Delete this rule</button>
    </div>
  </aside>
</div>`;
}

// ---------------------------------------------------------------------------
// 04 Bench
// ---------------------------------------------------------------------------

function bench(): string {
  const tape = '1001';
  const head = 2;

  return `
<div class="m m-bench">
  <div class="bench-stage">
    <p class="bench-q">contains <b>01</b> somewhere &nbsp;<span>&mdash;&nbsp; ${LEVEL.setBuilder}</span></p>
    ${diagram(MACHINE, { pad: 44, active: ['q1'], lit: ['sol3-t2'] })}
    <div class="bench-cmd">
      <span class="bench-caret">&rsaquo;</span>
      <span class="bench-typed">q1 -1-&gt; q2</span><span class="bench-cursor"></span>
      <span class="bench-ghost">enter to add &middot; / for commands</span>
    </div>
  </div>

  <aside class="bench-pane">
    <section>
      <p class="bench-h">Run <code>${tape}</code></p>
      <div class="bench-tape">
        ${[...tape]
          .map(
            (c, i) =>
              `<span class="bench-cell${i === head ? ' is-head' : ''}${i < head ? ' is-read' : ''}">${c}</span>`,
          )
          .join('')}
      </div>
      <p class="bench-state">step 3 of 5 &middot; in <b>q1</b> &middot; <span class="ok">accepts</span></p>
      <div class="bench-scrub"><i style="left:52%"></i></div>
    </section>

    <section>
      <p class="bench-h raw">δ</p>
      <ul class="bench-delta">
        ${DELTA.map(
          (l, i) => `<li${i === 2 ? ' class="is-on"' : ''}><code>${l.text}</code></li>`,
        ).join('')}
      </ul>
    </section>

    <section>
      <p class="bench-h">Suite</p>
      <ul class="bench-lamps">
        ${LEVEL.tests
          .map(
            (w) =>
              `<li><i class="${LEVEL.accepts(w) ? 'on' : 'off'}"></i>` +
              `<code>${show(w)}</code>` +
              `<em>${LEVEL.accepts(w) ? 'accept' : 'reject'}</em></li>`,
          )
          .join('')}
      </ul>
    </section>
  </aside>
</div>`;
}

// ---------------------------------------------------------------------------
// failure state, shown once
// ---------------------------------------------------------------------------

function failing(): string {
  const brokenAccepted = ACCEPTED.map((w) => ({ w, ok: !['001', '0101', '1001'].includes(w) }));
  return `
<div class="m m-brief is-fail">
  <aside class="brief-pane">
    <p class="brief-eyebrow">Level 3 of 12 &middot; Finite automaton</p>
    <h3 class="brief-q">Accept the strings that contain <b>01</b> somewhere inside them.</h3>
    <code class="brief-set">${LEVEL.setBuilder}</code>
    <div class="brief-split">
      <section>
        <p class="brief-h">These must be accepted</p>
        <ul class="k-verdicts">
          ${brokenAccepted.map((r) => verdictRow(r.w, r.ok)).join('')}
        </ul>
      </section>
      <section>
        <p class="brief-h">These must be rejected</p>
        ${verdictList(REJECTED)}
      </section>
    </div>
    <footer class="brief-foot is-fail">
      <span class="brief-score">9 of 12 agree</span>
      <span class="brief-why">Shortest disagreement <code>001</code></span>
    </footer>
  </aside>
  <main class="brief-canvas">
    <div class="brief-tools">
      <button title="Undo">${icon(ICONS.undo, 15)}</button>
      <button title="Redo">${icon(ICONS.redo, 15)}</button>
      <button title="Fit">${icon(ICONS.fit, 15)}</button>
    </div>
    ${diagram(BROKEN, { pad: 40 })}
    <p class="brief-hint">δ is partial: <b>δ(q1, 0)</b> is undefined, so <code>001</code> dies at the second 0</p>
  </main>
</div>`;
}

// ---------------------------------------------------------------------------
// phone frames
// ---------------------------------------------------------------------------

function phone(kind: 'brief' | 'sheet' | 'studio' | 'bench'): string {
  const inner: Record<string, string> = {
    brief: `
      <div class="p-canvas">${diagram(MACHINE, { pad: 30 })}</div>
      <div class="p-sheet">
        <span class="p-grab"></span>
        <p class="p-q">Contain <b>01</b> somewhere.</p>
        <div class="p-rows">
          ${ACCEPTED.slice(0, 3).map((w) => verdictRow(w, true)).join('')}
          ${REJECTED.slice(0, 2).map((w) => verdictRow(w, true)).join('')}
        </div>
      </div>`,
    sheet: `
      <div class="p-paper">
        <p class="p-num">Problem 3</p>
        <p class="p-serif">Accept the strings that contain 01 somewhere inside them.</p>
        <div class="p-fig">${diagram(MACHINE, { pad: 26 })}</div>
        <p class="p-mark"><span class="k-mark">${icon(ICONS.tick, 13)}</span> 12 of 12</p>
      </div>`,
    studio: `
      <div class="p-canvas">
        <div class="p-rail">
          <button class="is-on">${icon(ICONS.cursor, 14)}</button>
          <button>${icon(ICONS.circle, 14)}</button>
          <button>${icon(ICONS.arrow, 14)}</button>
          <button>${icon(ICONS.erase, 14)}</button>
        </div>
        ${diagram(MACHINE, { pad: 30 })}
      </div>
      <div class="p-insp">
        <span class="p-grab"></span>
        <div class="p-tabs"><b>Brief</b><span>Rules</span><span>Analysis</span></div>
        <p class="p-q">Contain <b>01</b> somewhere.</p>
        <div class="p-rows">${ACCEPTED.slice(0, 3).map((w) => verdictRow(w, true)).join('')}</div>
      </div>`,
    bench: `
      <div class="p-canvas dark">${diagram(MACHINE, { pad: 30, active: ['q1'] })}</div>
      <div class="p-bench">
        <div class="p-lamps">
          ${LEVEL.tests.map((w) => `<i class="${LEVEL.accepts(w) ? 'on' : 'off'}"></i>`).join('')}
        </div>
        <div class="p-cmd"><span>&rsaquo;</span> q1 -1-&gt; q2</div>
      </div>`,
  };
  return `<div class="phone ${kind}"><div class="phone-in">${inner[kind]}</div></div>`;
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

const face = (file: string, family: string, weight: string, style = 'normal'): string => {
  const path = file.startsWith('/') ? file : join(ROOT, 'web', 'src', 'fonts', file);
  const b64 = readFileSync(path).toString('base64');
  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
};

const FONTS = [
  face('mono-400.woff2', 'K Mono', '400'),
  face('mono-500.woff2', 'K Mono', '500'),
  face('mono-700.woff2', 'K Mono', '700'),
  face('sans-latin.woff2', 'K Sans', '100 900'),
  face('sans-greek.woff2', 'K Sans', '100 900'),
  face('serif-latin.woff2', 'K Serif', '200 900'),
  face(join(EXTRA_FONTS, 'serif-2.woff2'), 'K Serif Two', '200 900'),
  face(join(EXTRA_FONTS, 'serif-2-italic.woff2'), 'K Serif Two', '200 900', 'italic'),
  face(join(EXTRA_FONTS, 'plex-400.woff2'), 'K Plex', '400'),
  face(join(EXTRA_FONTS, 'plex-500.woff2'), 'K Plex', '500'),
  face(join(EXTRA_FONTS, 'plex-600.woff2'), 'K Plex', '600'),
].join('\n');

const CSS = readFileSync(join(ROOT, 'scripts', 'ui-study.css'), 'utf8');

interface Direction {
  n: string;
  name: string;
  thesis: string;
  body: string;
  notes: [string, string][];
  mockup: string;
  phone: string;
  wide?: boolean;
}

const DIRECTIONS: Direction[] = [
  {
    n: '01',
    name: 'Brief',
    thesis: 'The puzzle is a sentence, and the test suite is the same object as the puzzle.',
    body:
      'The left pane is what you are being asked, written out: the question in plain English, ' +
      'the language underneath it, and then the two lists that actually define the level. ' +
      'Those lists are the grader. A tick appears beside a string the moment your machine agrees ' +
      'with it, so there is no separate results band to read, and no counting up of a score you ' +
      'then have to interpret.',
    notes: [
      ['Tools', 'None persistent. Double click places a state, dragging from a rim draws an arrow, holding a state renames it. Three quiet icons in the corner for undo, redo and fit.'],
      ['The formal layer', 'One disclosure at the foot of the pane. The tuple and δ slide over the brief when asked for, and go away again.'],
      ['On a phone', 'The canvas is the screen; the brief is a sheet you pull up from the bottom edge, half height, and push back down.'],
      ['What it costs', 'Discoverability. Nothing on screen says "you can make a state", so the one hint line under the canvas is doing real work and has to stay.'],
    ],
    mockup: brief(),
    phone: phone('brief'),
  },
  {
    n: '02',
    name: 'Worksheet',
    thesis: 'It is an exercise from a book, and it is marked in the margin.',
    body:
      'The most interpretable version of the thing. A numbered problem, stated in a serif at ' +
      'reading size, then the diagram as a figure, then the transition function as a table, then ' +
      'the marking as a table. The right margin holds the marks and the note, the way a returned ' +
      'script does. Nothing is a panel; everything is part of one document you read top to bottom.',
    notes: [
      ['Tools', 'A rail of four inside the figure box, where the drawing is. Select, state, arrow, erase.'],
      ['The formal layer', 'Not hidden at all. δ is Table 1, printed. There is nothing to open.'],
      ['On a phone', 'Same document, one column, margin notes fold in under the figure they belong to.'],
      ['What it costs', 'Speed. This is the slowest of the four to operate, and the least like a tool. It reads beautifully and it will annoy anyone who already knows what they are doing.'],
    ],
    mockup: worksheet(),
    phone: phone('sheet'),
  },
  {
    n: '03',
    name: 'Studio',
    thesis: 'A drawing tool that happens to grade you. One pane, showing one thing.',
    body:
      'The model every drawing app already taught people: a thin tool rail on the edge of the ' +
      'canvas, the canvas taking everything else, and a single inspector on the right. The ' +
      'inspector is contextual, which is what kills the overload. Nothing selected and it shows ' +
      'the brief. An arrow selected and it shows that rule. Three tabs, not eight buttons, and ' +
      'the score is one bar that is always there.',
    notes: [
      ['Tools', 'Four, modal, on the canvas, each with a single key. Pick the state tool and click three times.'],
      ['The formal layer', 'The Rules tab of the same pane. One click away, never in the way.'],
      ['On a phone', 'The rail becomes a floating column on the canvas; the inspector becomes a sheet that rises when something is selected and falls when it is not.'],
      ['What it costs', 'Modes. A modal tool rail means a click sometimes does something you did not expect, which is the oldest complaint about every editor of this shape.'],
    ],
    mockup: studio(),
    phone: phone('studio'),
    wide: true,
  },
  {
    n: '04',
    name: 'Bench',
    thesis: 'The machine is under test. You operate it, and you can type at it.',
    body:
      'For the person who would rather type than click. The canvas has no chrome at all; a ' +
      'command line under it takes <code>q1 -1-&gt; q2</code>, <code>accept q2</code>, ' +
      '<code>start q0</code>, and a slash opens the rest. Direct manipulation still works. The ' +
      'right side is a readout rather than a control panel: the run, the tape, δ, and a column ' +
      'of lamps. The trace is the centre of this one, not an afterthought.',
    notes: [
      ['Tools', 'A command line, and the pointer. No buttons.'],
      ['The formal layer', 'Permanently on the right, because in this direction the formal object is the point rather than a reference.'],
      ['On a phone', 'The weakest of the four. The command line needs a keyboard; touch falls back to direct manipulation and the lamps compress to a single row.'],
      ['What it costs', 'Reach. It is the most enjoyable to use if you already know the subject and the least welcoming if you do not, which is the wrong way round for level 1.'],
    ],
    mockup: bench(),
    phone: phone('bench'),
  },
];

const html = `<title>automata-k &middot; interface directions</title>
<style>
${FONTS}
${CSS}
</style>

<header class="page-head">
  <p class="eyebrow">automata-k</p>
  <h1>Four interfaces</h1>
  <p class="lede">The current one is being replaced rather than adjusted. These are four different
  answers to the same screen, each drawn at fidelity on the same level, with the same machine, using
  the real arrow geometry. Pick one, or pick parts of more than one.</p>
</header>

<section class="wrong">
  <h2>What is wrong with the one you have</h2>
  <ol>
    <li><b>Eight buttons of equal weight, in a dock.</b> Add, Connect, Tidy, Undo, Redo, Notes,
      Analyse, Hint all look the same and none of them is near the thing it acts on.</li>
    <li><b>Everything is open at once.</b> The tuple, the whole of δ, twelve test cells, a
      counterexample and a banner, permanently, whether or not you are looking at any of them.</li>
    <li><b>The puzzle is a subtitle.</b> The plain English sentence you are actually solving is
      15px of body text under a title.</li>
    <li><b>The drawing tools are not on the drawing.</b> To add a state you leave the canvas, go
      to the bottom of the window, and come back.</li>
    <li><b>It stacks on a widescreen.</b> The pane belongs at the side.</li>
  </ol>
</section>

${DIRECTIONS.map(
  (d) => `
<section class="dir" id="d${d.n}">
  <div class="dir-head">
    <p class="dir-n">${d.n}</p>
    <div>
      <h2>${d.name}</h2>
      <p class="dir-thesis">${d.thesis}</p>
    </div>
  </div>

  <div class="frame${d.wide ? ' frame-stack' : ''}">${d.mockup}</div>

  <div class="dir-foot">
    <div class="dir-body"><p>${d.body}</p>${d.phone}</div>
    <dl class="dir-notes">
      ${d.notes.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
    </dl>
  </div>
</section>`,
).join('')}

<section class="dir" id="fail">
  <div class="dir-head">
    <p class="dir-n">&mdash;</p>
    <div>
      <h2>Being wrong</h2>
      <p class="dir-thesis">Half of a puzzle game is the failing state. Here it is, in 01.</p>
    </div>
  </div>
  <div class="frame">${failing()}</div>
  <div class="dir-foot">
    <div class="dir-body"><p>One rule has been deleted. Three ticks become crosses in the list you
    were already reading, the count changes, and the shortest string that disagrees is named. No
    modal, no red banner, no separate results panel: the thing you were looking at is the thing
    that changed. Every direction here can do this; it reads most directly in 01 because the
    marks live in the brief.</p></div>
  </div>
</section>

<section class="pick">
  <h2>What I would build</h2>
  <p><b>03 Studio for the shape, 01 Brief for the pane.</b> Studio solves the two complaints that
  are actually about mechanics: the tools go on the canvas where the drawing is, and the single
  contextual inspector means one thing is on screen at a time instead of five. But its default
  pane should be 01's brief rather than a generic panel, because the accept and reject lists with
  live marks are the best idea here: they make the puzzle readable in plain English and grade it
  in the same breath, and they delete the entire results band.</p>
  <p>02 Worksheet is the one to steal from rather than build. Its numbering, its figure and table
  captions and its margin note are a better way to write the reference material than a sheet with
  tabs, and they can sit inside 03's Analysis tab without changing anything else.</p>
  <p>04 Bench is a real preference, not a worse one, but it is the wrong front door for someone
  meeting a finite automaton for the first time. It would make an excellent second mode later,
  behind a key, for the same reason a good editor ships both a mouse and a command line.</p>
</section>

<footer class="page-foot">
  <p>Same level, same verified machine, same geometry in all four. Type is JetBrains Mono for
  notation throughout, with Inter, Source Serif 4 and IBM Plex Sans carrying the four voices.</p>
</footer>
`;

writeFileSync(OUT, html);
console.log(`  ${OUT}`);
console.log(`  ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`);
