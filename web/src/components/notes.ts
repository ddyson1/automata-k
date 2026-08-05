/**
 * Level notes.
 *
 * Four tabs over the same level: the language it asks for, a grammar that
 * generates it, the class of machine that can recognise it, and the diagram
 * read back in words. Notation only, no LaTeX, and everything selectable so it
 * can be copied into whatever the player is actually studying from.
 */

import {
  HIERARCHY,
  MACHINE_CLASS,
  grammarLines,
  grammarTuple,
  hierarchyBlurb,
  machineSpeech,
} from '../../../src/engine/formal';
import type { Level, Machine } from '../../../src/engine/types';
import { fill, h, on } from '../dom';
import { notation } from '../notation';

export type NotesSection = 'language' | 'grammar' | 'class' | 'machine';

const SECTIONS: { key: NotesSection; label: string }[] = [
  { key: 'language', label: 'Language' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'class', label: 'Class' },
  { key: 'machine', label: 'Machine' },
];

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

function languageSection(level: Level): Node[] {
  return [
    block('The language', mono(level.setBuilder)),
    block('Why', prose(level.theory)),
    block(
      'Test suite',
      h(
        'p',
        { class: 't-small muted' },
        `${level.tests.length} fixed strings, plus an exhaustive check to length ` +
          `${level.exhaustiveMaxLength} in the verification suite. Expected results always ` +
          'come from the language itself, never from a stored answer key.',
      ),
    ),
  ];
}

function grammarSection(level: Level): Node[] {
  return [
    block(
      'A grammar for it',
      h('div', { class: 'lines' }, ...grammarLines(level.grammar).map((line) => mono(line))),
    ),
    block(
      'Grammar tuple',
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
    ),
    block(
      `Chomsky type ${level.chomsky}`,
      prose(hierarchyBlurb(level)),
      h(
        'div',
        { class: 'scroll-x' },
        h(
        'table',
        { class: 'hierarchy' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, 'Type'),
            h('th', {}, 'Productions'),
            h('th', {}, 'Machine'),
            h('th', {}, 'Example'),
          ),
        ),
        h(
          'tbody',
          {},
          ...HIERARCHY.map((r) =>
            h(
              'tr',
              { class: r.type === level.chomsky ? 'is-here' : '' },
              h('td', { class: 't-mono-sm' }, String(r.type)),
              h('td', { class: 't-mono-sm' }, r.productions),
              h('td', { class: 't-small' }, r.machine),
              h('td', { class: 't-mono-sm' }, (() => {
                const cell = h('span', {});
                cell.appendChild(notation(r.example));
                return cell;
              })()),
            ),
          ),
        ),
        ),
      ),
    ),
  ];
}

function classSection(level: Level): Node[] {
  const copy = MACHINE_CLASS[level.type];
  return [
    block('Definition', mono(copy.definition)),
    block('Acceptance', mono(copy.acceptance)),
    block(`What a ${copy.name.toLowerCase()} can do`, prose(copy.power)),
  ];
}

function machineSection(machine: Machine, level: Level): Node[] {
  return [
    block('The diagram in words', prose(machineSpeech(machine, level))),
    block(
      'Hint',
      h('details', { class: 'hint' }, h('summary', { class: 't-small' }, 'Show the hint'), prose(level.hint)),
    ),
  ];
}

export function buildNotes(
  into: HTMLElement,
  level: Level,
  machine: Machine,
  initial: NotesSection,
): void {
  let active: NotesSection = initial;
  const panel = h('div', { class: 'note-panel' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });

  const paint = (): void => {
    for (const node of tabs.children) {
      const on_ = node.getAttribute('data-section') === active;
      node.classList.toggle('is-on', on_);
      node.setAttribute('aria-selected', String(on_));
    }
    const content =
      active === 'language'
        ? languageSection(level)
        : active === 'grammar'
          ? grammarSection(level)
          : active === 'class'
            ? classSection(level)
            : machineSection(machine, level);
    fill(panel, ...content);
  };

  for (const section of SECTIONS) {
    const node = h(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        'data-section': section.key,
        'data-testid': `tab-${section.key}`,
      },
      section.label,
    );
    on(node, 'click', () => {
      active = section.key;
      paint();
    });
    tabs.appendChild(node);
  }

  fill(into, tabs, panel);
  paint();
}
