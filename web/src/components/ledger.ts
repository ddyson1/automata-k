/**
 * The formal layer.
 *
 * A machine is a diagram and a tuple and a transition function at the same
 * time, so all three are on screen at once and none of them is behind a
 * button. The tuple collapses; the delta list never does.
 *
 * Highlighting runs both ways. Pointing at a delta line lights the arrows it
 * came from, and selecting an arrow lights its line and scrolls it into view.
 * Gaps are red and counted, because "delta is partial" is the thing a player
 * has to notice before they can fix it.
 */

import { deltaSummary, machineTuple } from '../../../src/engine/formal';
import type { DeltaLine } from '../../../src/engine/formal';
import type { Level, Machine, TransitionId } from '../../../src/engine/types';
import { fill, h, on, setText } from '../dom';
import { setNotation } from '../notation';

export interface LedgerState {
  machine: Machine;
  level: Level;
  /** Transitions the diagram currently has selected. */
  selected: readonly TransitionId[];
}

export interface LedgerCallbacks {
  /** Pointer entered or left a line. Empty array means "nothing lit". */
  onHighlight: (transitionIds: readonly TransitionId[]) => void;
  /** A line was activated. Opens the rule for editing, or the gap for filling. */
  onActivate: (line: DeltaLine) => void;
}

export interface Ledger {
  el: HTMLElement;
  update(state: LedgerState): void;
}

export function createLedger(callbacks: LedgerCallbacks): Ledger {
  const tupleBody = h('dl', { class: 'tuple' });
  const tupleToggle = h(
    'button',
    {
      class: 'band-toggle',
      type: 'button',
      'aria-expanded': 'true',
      'data-testid': 'tuple-toggle',
    },
    h('span', { class: 't-label' }, 'The machine'),
    h('span', { class: 'chevron', 'aria-hidden': 'true' }),
  );

  const signature = h('code', { class: 't-mono-sm sig', 'data-testid': 'delta-signature' });
  const list = h('ol', { class: 'delta', 'data-testid': 'delta-list' });
  const note = h('p', { class: 't-small muted delta-note', 'data-testid': 'delta-note' });

  const el = h(
    'section',
    { class: 'ledger', 'data-testid': 'ledger' },
    h('div', { class: 'band' }, tupleToggle, tupleBody),
    h(
      'div',
      { class: 'band band-delta' },
      h(
        'div',
        { class: 'band-head' },
        h('span', { class: 't-label' }, 'Transition function'),
        signature,
      ),
      list,
      note,
    ),
  );

  let expanded = true;
  on(tupleToggle, 'click', () => {
    expanded = !expanded;
    tupleToggle.setAttribute('aria-expanded', String(expanded));
    tupleBody.classList.toggle('is-collapsed', !expanded);
  });

  /** Rendered lines, kept so an update can reuse rather than rebuild them. */
  let rendered: { line: DeltaLine; node: HTMLLIElement }[] = [];
  let lastKey = '';

  function renderLines(lines: DeltaLine[]): void {
    const key = lines.map((l) => `${l.text}|${l.missing}|${l.transitionIds.join(',')}`).join('\n');
    if (key === lastKey) return;
    lastKey = key;

    list.textContent = '';
    rendered = lines.map((line) => {
      const text = h('code', { class: 't-mono' });
      setNotation(text, line.text);
      const node = h(
        'li',
        {
          class: `delta-line${line.missing ? ' is-missing' : ''}`,
          'data-testid': 'delta-line',
        },
        h(
          'button',
          {
            class: 'delta-hit',
            type: 'button',
            'aria-label': line.missing
              ? `${line.text}. Undefined. Activate to add this rule.`
              : `${line.text}. Activate to edit.`,
          },
          text,
        ),
      );
      const hit = node.firstElementChild as HTMLButtonElement;
      on(hit, 'pointerenter', () => callbacks.onHighlight(line.transitionIds));
      on(hit, 'pointerleave', () => callbacks.onHighlight([]));
      on(hit, 'focus', () => callbacks.onHighlight(line.transitionIds));
      on(hit, 'blur', () => callbacks.onHighlight([]));
      on(hit, 'click', () => callbacks.onActivate(line));
      return { line, node };
    });
    for (const item of rendered) list.appendChild(item.node);
  }

  function renderTuple(machine: Machine, level: Level): void {
    const lines = machineTuple(machine, level);
    fill(
      tupleBody,
      ...lines.flatMap((line) => [
        h('dt', { class: 't-mono-sm' }, line.symbol),
        h(
          'dd',
          {},
          h('code', { class: 't-mono-sm sel' }, line.value),
          h('span', { class: 't-small faint gloss' }, line.gloss),
        ),
      ]),
    );
  }

  return {
    el,
    update(state) {
      renderTuple(state.machine, state.level);

      const summary = deltaSummary(state.machine, state.level);
      setText(signature, summary.signature);
      renderLines(summary.lines);
      setText(note, summary.note);
      note.classList.toggle('fail', !summary.total);

      let firstSelected: HTMLElement | null = null;
      for (const { line, node } of rendered) {
        const lit =
          line.transitionIds.length > 0 &&
          line.transitionIds.some((id) => state.selected.includes(id));
        node.classList.toggle('is-lit', lit);
        if (lit && !firstSelected) firstSelected = node;
      }
      // Selecting an arrow should bring its rule to where it can be read.
      if (firstSelected) {
        firstSelected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
  };
}
