/**
 * The brief.
 *
 * What you are being asked, written out: the question in plain English, the
 * language underneath it, and then the two lists that actually define the
 * level. Those lists are also the grader. A tick appears beside a string the
 * moment the machine agrees with it, which is why there is no results band
 * anywhere in this app and no score to translate into a diagnosis.
 *
 * Tapping a string runs it, so the thing you are reading is also the thing you
 * can step through.
 */

import { shortestCounterexample } from '../../../src/engine/simulate';
import type { SuiteResult } from '../../../src/engine/simulate';
import type { Level, Machine } from '../../../src/engine/types';
import { EPSILON } from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';
import { setNotation } from '../notation';

export interface BriefCallbacks {
  onBack: () => void;
  onTrace: (input: string) => void;
  onOpenMachine: () => void;
  onOpenHint: () => void;
  onNext: () => void;
}

export interface BriefState {
  level: Level;
  machine: Machine;
  result: SuiteResult;
  /** The string the trace is currently showing. */
  playing: string | null;
  solved: boolean;
  /** Smallest state count this level has been solved with. */
  best: number | undefined;
  hasNext: boolean;
}

export interface Brief {
  el: HTMLElement;
  update(state: BriefState): void;
}

const show = (w: string): string => (w === '' ? EPSILON : w);

const CLASS_NAME: Record<string, string> = {
  DFA: 'Finite automaton',
  NFA: 'Finite automaton, nondeterministic',
  PDA: 'Pushdown automaton',
  TM: 'Turing machine',
};

export function createBrief(callbacks: BriefCallbacks): Brief {
  const back = h(
    'button',
    { class: 'back', type: 'button', 'data-testid': 'back', 'aria-label': 'All levels' },
    '‹',
  );
  on(back, 'click', () => callbacks.onBack());

  const eyebrow = h('p', { class: 'brief-eyebrow' });
  const question = h('h1', { class: 'brief-q', 'data-testid': 'goal' });
  const language = h('code', { class: 'brief-set t-mono-sm sel', 'data-testid': 'set-builder' });

  const acceptList = h('ul', { class: 'verdicts', 'data-testid': 'accept-list' });
  const rejectList = h('ul', { class: 'verdicts', 'data-testid': 'reject-list' });

  const score = h('p', { class: 'brief-score', 'data-testid': 'score' });
  const why = h('p', { class: 't-small brief-why', 'data-testid': 'why' });

  const machineLink = h(
    'button',
    { class: 'brief-link', type: 'button', 'data-testid': 'open-machine' },
    'The machine',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  on(machineLink, 'click', () => callbacks.onOpenMachine());

  const hintLink = h(
    'button',
    { class: 'brief-link', type: 'button', 'data-testid': 'open-hint' },
    'Stuck',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  on(hintLink, 'click', () => callbacks.onOpenHint());

  const nextLink = h(
    'button',
    { class: 'brief-link is-next', type: 'button', 'data-testid': 'next-level', hidden: true },
    'Next level',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  on(nextLink, 'click', () => callbacks.onNext());

  const el = h(
    'section',
    { class: 'brief', 'data-testid': 'brief' },
    h('div', { class: 'brief-top' }, back, eyebrow),
    question,
    language,
    h(
      'div',
      { class: 'brief-split' },
      h(
        'section',
        {},
        h('p', { class: 't-label' }, 'These must be accepted'),
        acceptList,
      ),
      h(
        'section',
        {},
        h('p', { class: 't-label' }, 'These must be rejected'),
        rejectList,
      ),
    ),
    h(
      'footer',
      { class: 'brief-foot' },
      score,
      why,
      h('div', { class: 'brief-links' }, machineLink, hintLink, nextLink),
    ),
  );

  /** Rows are rebuilt only when the level changes; the marks update in place. */
  let builtFor = '';
  const rows = new Map<string, { node: HTMLLIElement; mark: HTMLElement }>();

  function buildRows(level: Level): void {
    if (builtFor === level.id) return;
    builtFor = level.id;
    rows.clear();

    const make = (word: string): HTMLLIElement => {
      const mark = h('span', { class: 'mark', 'aria-hidden': 'true' });
      const node = h(
        'li',
        { class: 'verdict', 'data-testid': 'verdict' },
        h(
          'button',
          {
            class: 'verdict-hit',
            type: 'button',
            'data-input': word,
            'aria-label': `${show(word)}. Run it.`,
          },
          mark,
          h('code', { class: 't-mono-sm' }, show(word)),
        ),
      );
      on(node.firstElementChild as HTMLElement, 'click', () => callbacks.onTrace(word));
      rows.set(word, { node, mark });
      return node;
    };

    fill(acceptList, ...level.tests.filter((w) => level.accepts(w)).map(make));
    fill(rejectList, ...level.tests.filter((w) => !level.accepts(w)).map(make));
  }

  return {
    el,
    update(state) {
      const { level, result } = state;
      buildRows(level);

      setText(
        eyebrow,
        `Level ${level.index} of 12 · ${CLASS_NAME[level.type] ?? level.type}`,
      );
      setNotation(question, level.goal);
      setNotation(language, level.setBuilder);

      const started = state.machine.states.length > 0;
      for (const row of result.rows) {
        const entry = rows.get(row.input);
        if (!entry) continue;
        const ok = row.pass;
        entry.node.classList.toggle('is-off', started && !ok);
        entry.node.classList.toggle('is-blank', !started);
        entry.node.classList.toggle('is-playing', state.playing === row.input);
        setText(entry.mark, !started ? '·' : ok ? '✓' : '✕');
      }

      el.classList.toggle('is-solved', result.solved);
      el.classList.toggle('is-broken', started && Boolean(result.error));

      if (!started) {
        setText(score, 'Nothing drawn yet');
        setText(why, 'Double click the canvas to place a state.');
      } else if (result.error) {
        setText(score, 'Not a machine yet');
        setText(why, result.error);
      } else if (result.solved) {
        const n = state.best ?? state.machine.states.length;
        setText(score, `All ${result.total} agree`);
        setText(why, `${n} ${n === 1 ? 'state' : 'states'}, par ${level.par}.`);
      } else {
        setText(score, `${result.passed} of ${result.total} agree`);
        const witness = shortestCounterexample(state.machine, level);
        setText(
          why,
          witness
            ? `Shortest disagreement: ${show(witness.input)}, which should be ` +
                `${witness.expected ? 'accepted' : 'rejected'}.`
            : '',
        );
      }

      nextLink.hidden = !(state.solved && state.hasNext);
    },
  };
}
