/**
 * Theory, and the hint.
 *
 * The reference material behind the brief: a grammar that generates the same
 * language, where the level sits in the hierarchy, and what its class of
 * machine can and cannot do. Notation only, no LaTeX, everything selectable so
 * it can be copied into whatever the player is actually studying from.
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

export function buildTheory(into: HTMLElement, level: Level, machine: Machine): void {
  const copy = MACHINE_CLASS[level.type];

  fill(
    into,
    block('Why this language needs this machine', prose(level.theory)),
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
            ...HIERARCHY.map((r) => {
              const example = h('span', {});
              example.appendChild(notation(r.example));
              return h(
                'tr',
                { class: r.type === level.chomsky ? 'is-here' : '' },
                h('td', { class: 't-mono-sm' }, String(r.type)),
                h('td', { class: 't-mono-sm' }, r.productions),
                h('td', { class: 't-small' }, r.machine),
                h('td', { class: 't-mono-sm' }, example),
              );
            }),
          ),
        ),
      ),
    ),
    block(copy.name, mono(copy.definition), mono(copy.acceptance), prose(copy.power)),
    block('Your diagram, in words', prose(machineSpeech(machine, level))),
  );
}

export interface HintOptions {
  level: Level;
  shown: boolean;
  onReveal: () => void;
}

export function buildHint(into: HTMLElement, options: HintOptions): void {
  const { level, shown } = options;

  const reveal = h(
    'button',
    { class: 'action is-primary', type: 'button', 'data-testid': 'reveal' },
    shown ? 'Show it again' : 'Put a worked solution on the canvas',
  );
  on(reveal, 'click', () => options.onReveal());

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
  );
}
