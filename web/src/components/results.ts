/**
 * The results card.
 *
 * A passing run is a moment, so it gets one: a card over the chamber with the
 * level's name, what was built, and what the theory says about how small it
 * could have been. A DFA has exactly one minimal machine, and it can be
 * computed, so there the card says whether yours is it and ranks nothing.
 * For the other classes no algorithm can find the minimum, and the card says
 * why rather than pretending par is one.
 *
 * There is no histogram of other players: that would need a server, and the
 * game makes no network calls.
 *
 * A native modal dialog, so focus, Escape and the inert page behind it come
 * from the browser.
 */

import { scoreNote, scoreOf } from '../../../src/engine/minimize';
import type { Level, Machine } from '../../../src/engine/types';
import { h, on, setText } from '../dom';

export interface Results {
  el: HTMLDialogElement;
  show(state: { level: Level; machine: Machine; again: boolean; hasNext: boolean }): void;
  close(): void;
  readonly isOpen: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function createResults(callbacks: { onNext: () => void; onClimb: () => void }): Results {
  const title = h('span', { class: 'results-t', id: 'results-title' });
  const status = h('span', { class: 'results-s' });
  const stats = h('div', { class: 'results-stats', 'data-testid': 'results-stats' });
  const verdict = h('p', { class: 'results-verdict', 'data-testid': 'results-verdict' });
  const said = h('p', { class: 'results-said', 'data-testid': 'score-note' });
  const stay = h('button', { class: 'results-b', type: 'button', 'data-testid': 'results-stay' }, 'Stay');
  const onward = h(
    'button',
    { class: 'results-b is-primary', type: 'button', 'data-testid': 'results-next' },
    'Next level',
  );

  const el = h(
    'dialog',
    { class: 'results', 'data-testid': 'results', 'aria-labelledby': 'results-title' },
    h(
      'div',
      { class: 'results-card' },
      h('div', { class: 'results-hd' }, title, status),
      stats,
      verdict,
      said,
      h('div', { class: 'results-acts' }, stay, onward),
    ),
  );

  let next: 'level' | 'climb' = 'level';

  const close = (): void => {
    if (el.open) el.close();
  };

  on(stay, 'click', close);
  on(onward, 'click', () => {
    close();
    if (next === 'level') callbacks.onNext();
    else callbacks.onClimb();
  });
  // A click on the backdrop is a click outside the card.
  on(el, 'click', (event: MouseEvent) => {
    if (event.target === el) close();
  });

  const stat = (value: number | string, label: string): HTMLElement =>
    h('span', {}, h('b', {}, String(value)), label);

  return {
    el,
    get isOpen() {
      return el.open;
    },
    show({ level, machine, again, hasNext }) {
      const s = scoreOf(machine, level);
      setText(title, `L${pad(level.index)} · ${level.title}`);
      setText(status, again ? 'Solved again' : 'Solved');
      stats.replaceChildren(
        stat(s.scored, s.scored === 1 ? 'state' : 'states'),
        stat(level.par, 'par'),
        stat(machine.transitions.length, machine.transitions.length === 1 ? 'arrow' : 'arrows'),
      );
      // The theory's one sentence first, then the reason.
      const note = scoreNote(machine, level);
      const cut = note.indexOf('. ');
      setText(verdict, cut > 0 ? note.slice(0, cut + 1) : note);
      setText(said, cut > 0 ? note.slice(cut + 2) : '');
      said.hidden = cut <= 0;
      next = hasNext ? 'level' : 'climb';
      setText(onward, hasNext ? 'Next level' : 'Back to the climb');
      if (!el.open) el.showModal();
      onward.focus({ preventScroll: true });
    },
    close,
  };
}
