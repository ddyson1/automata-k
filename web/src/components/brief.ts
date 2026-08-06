/**
 * The brief.
 *
 * What you are being asked, written out: the question in plain English, the
 * language underneath it, and then the two lists that actually define the
 * level. Those lists are also the grader, which is why there is no results
 * band anywhere in this app and no score to translate into a diagnosis: the
 * thing you are reading is the thing that changes.
 *
 * It changes when asked. Every mark goes back to a dot the moment the machine
 * stops being the one that was run, because a tick that might no longer be
 * true is worse than no tick at all.
 *
 * Tapping a string runs it, so the thing you are reading is also the thing you
 * can step through.
 *
 * Four pieces rather than one block, because the pane arranges them around its
 * tabs. Which level this is, what it is asking, and how the machine is doing
 * are permanent; only the two lists are a tab. That is worth the extra seams:
 * the verdict used to disappear the moment you went to read the transition
 * function, which is exactly when you wanted it, and on a phone those three
 * permanent pieces are the whole top rail — the question stays on screen while
 * you draw, which no amount of sheet ever managed.
 */

import { LEVELS } from '../../../src/engine/levels';
import { shortestCounterexample } from '../../../src/engine/simulate';
import type { SuiteResult } from '../../../src/engine/simulate';
import type { Level, Machine } from '../../../src/engine/types';
import { EPSILON } from '../../../src/engine/types';
import { TOUCH, fill, h, on, setText } from '../dom';
import { setNotation } from '../notation';

export interface BriefCallbacks {
  onBack: () => void;
  onTrace: (input: string) => void;
  onRun: () => void;
  onNext: () => void;
}

export interface BriefState {
  level: Level;
  machine: Machine;
  result: SuiteResult;
  /** The machine has changed since `result` was computed. */
  stale: boolean;
  /** The string the trace is currently showing. */
  playing: string | null;
  solved: boolean;
  /** Smallest state count this level has been solved with. */
  best: number | undefined;
  hasNext: boolean;
}

export interface Brief {
  /** Which level this is. Above everything, so it never moves. */
  head: HTMLElement;
  /** What the level asks, in words and in set-builder. Permanent. */
  statement: HTMLElement;
  /** How the machine is doing. Permanent, and the rail's last line on a phone. */
  mark: HTMLElement;
  /** The two lists that define the level, and grade it. The first tab. */
  body: HTMLElement;
  /** Run, and what comes next. Docked over the canvas on a phone. */
  actions: HTMLElement;
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

  const runLink = h(
    'button',
    { class: 'brief-link', type: 'button', 'data-testid': 'run' },
    'Run the checks',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  on(runLink, 'click', () => callbacks.onRun());

  const nextLink = h(
    'button',
    { class: 'brief-link is-next', type: 'button', 'data-testid': 'next-level', hidden: true },
    'Next level',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  on(nextLink, 'click', () => callbacks.onNext());

  const head = h('div', { class: 'pane-head' }, back, eyebrow);

  const statement = h(
    'div',
    { class: 'brief-statement', 'data-testid': 'statement' },
    question,
    language,
  );

  const body = h(
    'section',
    { class: 'brief', 'data-testid': 'brief' },
    h(
      'div',
      { class: 'brief-split' },
      h('section', {}, h('p', { class: 't-label' }, 'These must be accepted'), acceptList),
      h('section', {}, h('p', { class: 't-label' }, 'These must be rejected'), rejectList),
    ),
  );

  const mark = h('div', { class: 'pane-mark', 'data-testid': 'pane-foot' }, score, why);

  const actions = h(
    'div',
    { class: 'pane-actions', 'data-testid': 'pane-actions' },
    runLink,
    nextLink,
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
    head,
    statement,
    mark,
    body,
    actions,
    update(state) {
      const { level, result } = state;
      buildRows(level);

      setText(
        eyebrow,
        `Level ${level.index} of ${LEVELS.length} · ${CLASS_NAME[level.type] ?? level.type}`,
      );
      setNotation(question, level.goal);
      setNotation(language, level.setBuilder);

      // A mark is only shown for a result that is still true of what is on
      // the canvas. After an edit every one goes back to the dot: not "wrong",
      // not "right", but not asked yet.
      const started = state.machine.states.length > 0;
      const known = started && !state.stale;
      for (const row of result.rows) {
        const entry = rows.get(row.input);
        if (!entry) continue;
        const ok = row.pass;
        entry.node.classList.toggle('is-off', known && !ok);
        entry.node.classList.toggle('is-blank', !known);
        entry.node.classList.toggle('is-playing', state.playing === row.input);
        setText(entry.mark, !known ? '·' : ok ? '✓' : '✕');
      }

      // The verdict lives in the mark, so the mark carries the state. Idle
      // means no run has happened that is still true of this machine — on a
      // phone the rail drops the line entirely rather than reserve space for
      // a verdict that does not exist yet.
      mark.classList.toggle('is-solved', known && result.solved);
      mark.classList.toggle('is-broken', known && Boolean(result.error));
      mark.classList.toggle('is-idle', !known);

      if (!started) {
        setText(score, 'Nothing drawn yet');
        setText(
          why,
          TOUCH
            ? 'Tap the canvas twice to place a state.'
            : 'Double click the canvas to place a state.',
        );
      } else if (state.stale) {
        setText(score, 'Not checked yet');
        setText(
          why,
          `${level.tests.length} strings are waiting. Nothing is graded until you ask.`,
        );
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

      // Running is the thing to do while the answer is unknown; once it is
      // known, the emphasis moves to whatever comes next.
      runLink.hidden = !started;
      runLink.classList.toggle('is-next', state.stale && !state.hasNext);
      setText(runLink.firstChild as Node, state.stale ? 'Run the checks' : 'Run again');
      nextLink.hidden = !(state.solved && state.hasNext);
    },
  };
}
