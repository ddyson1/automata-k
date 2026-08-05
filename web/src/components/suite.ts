/**
 * Live grading.
 *
 * The suite re-runs on every edit rather than behind a Run button, so the
 * machine is always being measured and the player is never guessing. Each test
 * is a cell: the string, and whether the machine agreed with the language.
 *
 * When it fails, the strip does not stop at a count. It names the shortest
 * string the machine and the language disagree on, which is usually the whole
 * diagnosis.
 */

import { shortestCounterexample } from '../../../src/engine/simulate';
import type { SuiteResult, TestRow } from '../../../src/engine/simulate';
import type { Level, Machine } from '../../../src/engine/types';
import { EPSILON } from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';

export interface SuiteCallbacks {
  /** Play a string in the trace player. */
  onTrace: (input: string) => void;
}

export interface SuiteState {
  machine: Machine;
  level: Level;
  result: SuiteResult;
  /** The string the trace player is currently showing. */
  playing: string | null;
}

export interface SuiteStrip {
  el: HTMLElement;
  update(state: SuiteState): void;
}

const show = (input: string): string => (input === '' ? EPSILON : input);

export function createSuite(callbacks: SuiteCallbacks): SuiteStrip {
  const score = h('span', { class: 't-mono-sm score', 'data-testid': 'suite-score' });
  const verdict = h('span', { class: 't-label verdict', 'data-testid': 'suite-verdict' });
  const cells = h('div', { class: 'cells', 'data-testid': 'suite-cells' });
  const detail = h('p', { class: 't-small detail', 'data-testid': 'suite-detail' });

  const el = h(
    'section',
    { class: 'suite', 'data-testid': 'suite' },
    h('div', { class: 'band-head' }, verdict, score),
    cells,
    detail,
  );

  let lastKey = '';
  let nodes: { row: TestRow; node: HTMLButtonElement }[] = [];

  function renderCells(rows: readonly TestRow[]): void {
    const key = rows.map((r) => `${r.input}:${r.pass ? 1 : 0}:${r.actual ? 1 : 0}`).join('|');
    if (key === lastKey) return;
    lastKey = key;

    nodes = rows.map((row) => {
      const node = h(
        'button',
        {
          class: `cell ${row.pass ? 'is-pass' : 'is-fail'}`,
          type: 'button',
          'data-testid': 'suite-cell',
          'data-input': row.input,
          'aria-label':
            `${show(row.input)}: expected ${row.expected ? 'accept' : 'reject'}, ` +
            `machine ${row.actual ? 'accepts' : 'rejects'}. Activate to trace it.`,
        },
        h('span', { class: 't-mono-sm' }, show(row.input)),
      );
      on(node, 'click', () => callbacks.onTrace(row.input));
      return { row, node };
    });
    fill(cells, ...nodes.map((n) => n.node));
  }

  return {
    el,
    update(state) {
      const { result } = state;
      // Nothing drawn is not a wrong answer. Painting twelve red cells at the
      // moment a level opens tells the player they have already failed, which
      // is both untrue and the worst possible first impression.
      const started = state.machine.states.length > 0;
      el.classList.toggle('is-blank', !started);
      renderCells(result.rows);
      for (const { row, node } of nodes) {
        node.classList.toggle('is-playing', state.playing === row.input);
      }

      setText(score, `${result.passed}/${result.total}`);
      el.classList.toggle('is-solved', result.solved);
      el.classList.toggle('is-broken', Boolean(result.error) && started);

      if (!started) {
        setText(verdict, 'Tests');
        setText(detail, 'Add a state to begin. The suite grades every edit as you make it.');
        detail.className = 't-small detail muted';
        return;
      }
      if (result.error) {
        setText(verdict, 'Not a machine yet');
        setText(detail, result.error);
        detail.className = 't-small detail fail';
        return;
      }
      if (result.solved) {
        setText(verdict, 'Every test passes');
        setText(
          detail,
          `${state.machine.states.length} ${state.machine.states.length === 1 ? 'state' : 'states'}, par ${state.level.par}.`,
        );
        detail.className = 't-small detail muted';
        return;
      }

      setText(verdict, 'Tests');
      const witness = shortestCounterexample(state.machine, state.level);
      if (witness) {
        setText(
          detail,
          `Shortest disagreement: ${show(witness.input)} should be ` +
            `${witness.expected ? 'accepted' : 'rejected'}, and is ` +
            `${witness.actual ? 'accepted' : 'rejected'}.`,
        );
        detail.className = 't-small detail fail';
      } else {
        setText(detail, 'No disagreement found within the search depth.');
        detail.className = 't-small detail muted';
      }
    },
  };
}
