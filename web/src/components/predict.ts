/**
 * Predict, then run: before a string plays, say what you expect.
 *
 * Watching a string go through a machine teaches less than it seems to,
 * because the eye follows the lit state without asking anything of it. A
 * guess made first changes that: the run becomes a check of what you thought
 * the machine does, and a wrong guess is the moment something is learned.
 *
 * It asks only while the answer is not already on screen. Once the suite has
 * run, each row's mark says what the machine does with that string, and a
 * question whose answer is showing is not a question. "Just play" skips it
 * this once; "Stop asking" turns it off, and Settings turns it back on.
 */

import { EPSILON } from '../../../src/engine/types';
import { h, on, setText } from '../dom';

export interface PredictPrompt {
  el: HTMLElement;
  /** Ask about `input`. `answer` gets true or false for a guess, null for no guess. */
  ask(input: string, answer: (said: boolean | null) => void): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createPredict(options: { onStopAsking: () => void }): PredictPrompt {
  const question = h('p', { class: 'predict-q', 'data-testid': 'predict-question' });
  const accept = h(
    'button',
    { class: 'coach-b is-primary', type: 'button', 'data-testid': 'predict-accept' },
    'Accept',
  );
  const reject = h(
    'button',
    { class: 'coach-b is-primary', type: 'button', 'data-testid': 'predict-reject' },
    'Reject',
  );
  const skip = h(
    'button',
    { class: 'coach-b', type: 'button', 'data-testid': 'predict-skip' },
    'Just play',
  );
  const stop = h(
    'button',
    { class: 'predict-stop', type: 'button', 'data-testid': 'predict-stop' },
    'Stop asking',
  );
  const el = h(
    'section',
    { class: 'predict', 'data-testid': 'predict', hidden: true, 'aria-label': 'Predict' },
    question,
    h('div', { class: 'predict-row' }, accept, reject, skip),
    stop,
  );

  let pending: ((said: boolean | null) => void) | null = null;

  function answer(said: boolean | null): void {
    const done = pending;
    pending = null;
    el.hidden = true;
    done?.(said);
  }

  on(accept, 'click', () => answer(true));
  on(reject, 'click', () => answer(false));
  on(skip, 'click', () => answer(null));
  on(stop, 'click', () => {
    options.onStopAsking();
    answer(null);
  });

  return {
    el,
    get isOpen() {
      return pending !== null;
    },
    ask(input, then) {
      pending = then;
      setText(question, `Will your machine accept ${input === '' ? EPSILON : input}?`);
      el.hidden = false;
      accept.focus({ preventScroll: true });
    },
    close() {
      pending = null;
      el.hidden = true;
    },
  };
}
