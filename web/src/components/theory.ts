/**
 * Theory, and the hint.
 *
 * The reference material behind the brief, and the place the game does its
 * teaching: what every letter of the tuple means in words, what it is in the
 * machine currently on the canvas, how to read a signature, and where the
 * level sits in the hierarchy.
 *
 * Everything here lays out in a single column no wider than the pane. The
 * hierarchy used to be a four column table inside a horizontal scroller, which
 * meant 877px of content in a 343px column on every screen size the app has:
 * two of the four columns were permanently off the edge, and the wheel only
 * moved them about a third of the time because the vertical scroller above
 * swallowed the gesture. A scrollbar was never the fix. Not needing one is.
 *
 * Notation only, no LaTeX, everything selectable so it can be copied into
 * whatever the player is actually studying from.
 */

import {
  HIERARCHY,
  MACHINE_CLASS,
  deltaTutor,
  glossaryFor,
  grammarLines,
  grammarTuple,
  hierarchyBlurb,
  machineSpeech,
  tupleTutor,
} from '../../../src/engine/formal';
import type { Level, Machine } from '../../../src/engine/types';
import { fill, h, on } from '../dom';
import { notation } from '../notation';

const block = (label: string, ...children: (Node | string)[]): HTMLElement =>
  h('div', { class: 'note-block' }, h('span', { class: 't-label' }, label), ...children);

const mono = (text: string): HTMLElement => {
  const node = h('code', { class: 't-mono sel' });
  node.appendChild(notation(text));
  return node;
};

const prose = (text: string): HTMLElement => {
  const node = h('p', { class: 't-body' });
  node.appendChild(notation(text));
  return node;
};

const small = (text: string): HTMLElement => {
  const node = h('p', { class: 't-small muted' });
  node.appendChild(notation(text));
  return node;
};

/**
 * One symbol, explained. The symbol is the heading rather than a first column,
 * so the prose gets the full width of the pane instead of whatever a table
 * decides to leave it.
 */
function tutorCard(symbol: string, name: string, plain: string, yours: string): HTMLElement {
  const sym = h('code', { class: 'tut-sym sel' });
  sym.appendChild(notation(symbol));
  const value = h('code', { class: 't-mono-sm sel' });
  value.appendChild(notation(yours));
  return h(
    'div',
    { class: 'tut', 'data-testid': 'tutor-card' },
    h('p', { class: 'tut-head' }, sym, h('span', { class: 't-small faint' }, name)),
    prose(plain),
    h('p', { class: 'tut-yours' }, h('span', { class: 't-label' }, 'Yours'), value),
  );
}

/** The hierarchy as four stacked entries. Was a table; a table did not fit. */
function hierarchyStack(level: Level): HTMLElement {
  const rows = HIERARCHY.map((r) => {
    const example = h('code', { class: 't-mono-sm sel' });
    example.appendChild(notation(r.example));
    const here = r.type === level.chomsky;
    return h(
      'div',
      { class: here ? 'tier is-here' : 'tier', 'data-testid': `tier-${r.type}` },
      h(
        'p',
        { class: 'tier-head' },
        h('span', { class: 'tier-n' }, String(r.type)),
        h('span', { class: 'tier-name' }, r.name),
        here ? h('span', { class: 't-label tier-here' }, 'you are here') : null,
      ),
      h(
        'dl',
        { class: 'tier-facts' },
        h('dt', {}, 'Rules look like'),
        h('dd', { class: 't-mono-sm sel' }, r.productions),
        h('dt', {}, 'Recognised by'),
        h('dd', { class: 't-small' }, r.machine),
        h('dt', {}, 'Such as'),
        h('dd', {}, example),
      ),
    );
  });
  return h('div', { class: 'tiers' }, ...rows);
}

export function buildTheory(into: HTMLElement, level: Level, machine: Machine): void {
  const copy = MACHINE_CLASS[level.type];
  const delta = deltaTutor(level.type);
  const glossary = glossaryFor(level);

  fill(
    into,
    block('Why this language needs this machine', prose(level.theory)),

    block(
      `${copy.name}, letter by letter`,
      mono(copy.definition),
      small('Each letter below, in words, and what it is in the machine you have drawn.'),
      h(
        'div',
        { class: 'tuts' },
        ...tupleTutor(machine, level).map((t) => tutorCard(t.symbol, t.name, t.plain, t.yours)),
      ),
    ),

    // Not "Reading δ": block labels are uppercased, and CSS uppercases δ to Δ.
    block(
      'Reading the transition function',
      mono(delta.signature),
      h(
        'dl',
        { class: 'sig' },
        h('dt', {}, 'You hand it'),
        h('dd', {}, delta.input),
        h('dt', {}, 'It hands back'),
        h('dd', {}, delta.output),
      ),
      prose(delta.reading),
    ),

    block('When the machine accepts', mono(copy.acceptance), prose(copy.power)),

    glossary.length > 0
      ? block(
          'The symbols',
          h(
            'dl',
            { class: 'gloss-list', 'data-testid': 'glossary' },
            ...glossary.flatMap((g) => [
              h('dt', { class: 't-mono-sm sel' }, g.symbol),
              h('dd', {}, notation(g.plain)),
            ]),
          ),
        )
      : null,

    block(
      'A grammar that generates it',
      h('div', { class: 'lines' }, ...grammarLines(level.grammar).map(mono)),
      h(
        'dl',
        { class: 'tuple' },
        ...grammarTuple(level.grammar).flatMap((line) => [
          h('dt', { class: 't-mono-sm' }, line.symbol),
          h(
            'dd',
            {},
            h('code', { class: 't-mono-sm sel' }, line.value),
            h('span', { class: 't-small faint gloss' }, line.gloss),
          ),
        ]),
      ),
      small(
        'A grammar builds strings; a machine takes them apart. They describe the same language ' +
          'from opposite ends, and which of the four shapes below the rules fit is what fixes ' +
          'the machine you need.',
      ),
    ),

    block(`Chomsky type ${level.chomsky}`, prose(hierarchyBlurb(level)), hierarchyStack(level)),

    block('Your diagram, in words', prose(machineSpeech(machine, level))),
  );
}

export interface HintOptions {
  level: Level;
  shown: boolean;
  /** Whether there is anything on the canvas to take off it. */
  drawn: boolean;
  onReveal: () => void;
  onClear: () => void;
}

export function buildHint(into: HTMLElement, options: HintOptions): void {
  const { level, shown, drawn } = options;

  const reveal = h(
    'button',
    { class: 'action is-primary', type: 'button', 'data-testid': 'reveal' },
    shown ? 'Show it again' : 'Put a worked solution on the canvas',
  );
  on(reveal, 'click', () => options.onReveal());

  const clear = h(
    'button',
    { class: 'action is-danger', type: 'button', 'data-testid': 'clear' },
    'Take everything off the canvas',
  );
  on(clear, 'click', () => options.onClear());

  fill(
    into,
    block('A nudge', prose(level.hint)),
    block(
      'The whole answer',
      h(
        'p',
        { class: 't-small muted' },
        shown
          ? 'This level is already marked as solved by reveal.'
          : 'Taking this marks the level as solved after seeing the answer, which is recorded ' +
            'separately from solving it yourself.',
      ),
      h('div', { class: 'sheet-actions' }, reveal),
    ),
    // Every level opens blank, so this is for getting back to blank without
    // reloading and losing the other levels you have open work on.
    drawn
      ? block(
          'Start again',
          h(
            'p',
            { class: 't-small muted' },
            'Empties this level and leaves every other one alone. Undo puts it back.',
          ),
          h('div', { class: 'sheet-actions' }, clear),
        )
      : null,
  );
}
