/**
 * Analysis.
 *
 * Three readings of the drawn machine, each of which answers a question the
 * verdict alone cannot:
 *
 *   Minimal    is this the smallest machine for this language, and if not,
 *              which states are unreachable or equivalent
 *   Determinise the subset construction, so an NFA is not magic
 *   Regex      the same language as an expression, by state elimination
 *
 * Every one of them can decline: a machine that is not a well formed DFA has no
 * minimal form, and saying so is better than showing a number that is wrong.
 */

import { minimise, subsetConstruction } from '../../../src/engine/minimize';
import { regexFor } from '../../../src/engine/regex';
import type { Level, Machine } from '../../../src/engine/types';
import { fill, h, on } from '../dom';
import type { Child } from '../dom';

export type AnalysisSection = 'minimal' | 'subset' | 'regex';

export interface AnalysisCallbacks {
  /** Put a derived machine on the canvas, replacing what is there. */
  onAdopt: (machine: Machine, description: string) => void;
  /**
   * Which reading is open. The panel is rebuilt whenever the machine changes,
   * so the choice has to live outside it or every edit throws you back to the
   * first tab.
   */
  onSection: (section: AnalysisSection) => void;
}

const SECTIONS: { key: AnalysisSection; label: string }[] = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'subset', label: 'Determinise' },
  { key: 'regex', label: 'Regex' },
];

const block = (label: string, ...children: Child[]): HTMLElement =>
  h('div', { class: 'note-block' }, h('span', { class: 't-label' }, label), ...children);

const declined = (why: string): Node[] => [
  h('p', { class: 't-body muted', 'data-testid': 'analysis-declined' }, why),
];

const labelsOf = (machine: Machine, ids: readonly string[]): string =>
  ids.map((id) => machine.states.find((s) => s.id === id)?.label ?? id).join(', ');

function minimalSection(
  machine: Machine,
  level: Level,
  callbacks: AnalysisCallbacks,
): Node[] {
  if (level.type !== 'DFA') {
    return declined(
      'Minimisation here is defined for deterministic finite automata. This level is a ' +
        `${level.type}, so there is no unique smallest machine to compare against.`,
    );
  }
  const result = minimise(machine, level.alphabet);
  if (!result) {
    return declined(
      'This is not a well formed DFA yet, so it has no minimal form. Fix the rules the ' +
        'transition function is complaining about first.',
    );
  }

  const parts: Node[] = [
    block(
      'Size',
      h(
        'p',
        { class: 't-body', 'data-testid': 'minimal-verdict' },
        result.minimal
          ? `Minimal. ${result.drawnStates} ${result.drawnStates === 1 ? 'state' : 'states'}, and no smaller machine accepts this language.`
          : `${result.drawnStates} drawn, ${result.minimalStates} needed. ${result.excess} could go.`,
      ),
      result.sinkAdded
        ? h(
            'p',
            { class: 't-small muted' },
            'Counted against the completed machine, so the implicit dead state is included ' +
              'and a partial δ is not penalised.',
          )
        : null,
    ),
  ];

  if (result.unreachable.length > 0) {
    parts.push(
      block(
        'Unreachable',
        h(
          'p',
          { class: 't-mono sel' },
          labelsOf(machine, result.unreachable),
        ),
        h('p', { class: 't-small muted' }, 'No input can get here from the start state.'),
      ),
    );
  }

  if (result.mergeable.length > 0) {
    parts.push(
      block(
        'Equivalent',
        ...result.mergeable.map((group) =>
          h('p', { class: 't-mono sel' }, `{${labelsOf(machine, group)}}`),
        ),
        h(
          'p',
          { class: 't-small muted' },
          'No string tells these apart, so they can be merged into one.',
        ),
      ),
    );
  }

  if (!result.minimal) {
    const adopt = h(
      'button',
      { class: 'action is-primary', type: 'button', 'data-testid': 'adopt-minimal' },
      'Put the minimal machine on the canvas',
    );
    on(adopt, 'click', () =>
      callbacks.onAdopt(result.machine, 'the minimal machine for this language'),
    );
    parts.push(h('div', { class: 'sheet-actions' }, adopt));
  }
  return parts;
}

function subsetSection(machine: Machine, level: Level, callbacks: AnalysisCallbacks): Node[] {
  if (level.type !== 'NFA' && level.type !== 'DFA') {
    return declined(
      'The subset construction determinises a finite automaton. A stack or a tape is not ' +
        'something it can carry across, so it does not apply to this level.',
    );
  }
  const result = subsetConstruction(machine, level.alphabet);
  if (!result) {
    return declined('Give the machine a start state and the subset construction can run.');
  }

  const table = h(
    'table',
    { class: 'subset-table', 'data-testid': 'subset-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'Subset'),
        ...level.alphabet.map((a) => h('th', { class: 't-mono-sm' }, a)),
      ),
    ),
    h(
      'tbody',
      {},
      ...result.states.map((state) =>
        h(
          'tr',
          { class: state.id === result.start ? 'is-start' : '' },
          h(
            'td',
            { class: 't-mono-sm' },
            (state.members.length === 0 ? '∅' : `{${state.members.join(',')}}`) +
              (state.accepting ? ' ✓' : ''),
          ),
          ...level.alphabet.map((a) => {
            const edge = result.edges.find((e) => e.from === state.id && e.symbol === a);
            const target = result.states.find((s) => s.id === edge?.to);
            return h(
              'td',
              { class: 't-mono-sm' },
              target
                ? target.members.length === 0
                  ? '∅'
                  : `{${target.members.join(',')}}`
                : '—',
            );
          }),
        ),
      ),
    ),
  );

  const adopt = h(
    'button',
    { class: 'action is-primary', type: 'button', 'data-testid': 'adopt-subset' },
    'Put the determinised machine on the canvas',
  );
  on(adopt, 'click', () => callbacks.onAdopt(result.machine, 'the determinised machine'));

  return [
    block(
      'Every reachable subset',
      h(
        'p',
        { class: 't-small muted' },
        `${result.states.length} ${result.states.length === 1 ? 'subset' : 'subsets'} reachable ` +
          `from ${machine.states.length} ${machine.states.length === 1 ? 'state' : 'states'}. ` +
          'A tick marks a subset containing an accepting state.',
      ),
      h('div', { class: 'scroll-x' }, table),
    ),
    h('div', { class: 'sheet-actions' }, adopt),
  ];
}

function regexSection(machine: Machine, level: Level): Node[] {
  if (level.type !== 'DFA' && level.type !== 'NFA') {
    return declined(
      'Regular expressions describe exactly the regular languages. This level is beyond ' +
        'them, which is the whole reason it needs a stack or a tape.',
    );
  }
  const source = regexFor(machine);
  if (source === null) {
    return declined('Give the machine a start state and an accepting state, and an expression follows.');
  }
  return [
    block(
      'By state elimination',
      h('code', { class: 't-mono sel wrap', 'data-testid': 'regex-source' }, source),
      h(
        'p',
        { class: 't-small muted' },
        'States are removed one at a time, least connected first, and their paths folded into ' +
          'the labels around them. What is left describes the same language as the diagram.',
      ),
    ),
  ];
}

export function buildAnalysis(
  into: HTMLElement,
  machine: Machine,
  level: Level,
  initial: AnalysisSection,
  callbacks: AnalysisCallbacks,
): void {
  let active: AnalysisSection = initial;
  const panel = h('div', { class: 'note-panel' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });

  const paint = (): void => {
    for (const node of tabs.children) {
      const on_ = node.getAttribute('data-section') === active;
      node.classList.toggle('is-on', on_);
      node.setAttribute('aria-selected', String(on_));
    }
    const content =
      active === 'minimal'
        ? minimalSection(machine, level, callbacks)
        : active === 'subset'
          ? subsetSection(machine, level, callbacks)
          : regexSection(machine, level);
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
      callbacks.onSection(section.key);
      paint();
    });
    tabs.appendChild(node);
  }

  fill(into, tabs, panel);
  paint();
}
