/**
 * Editing one rule.
 *
 * A transition is picked from the alphabets the level actually defines rather
 * than typed, so a player cannot invent a symbol that is not in Sigma and then
 * wonder why the machine ignores it. Which fields appear follows from the
 * class: a stack pop and push for a pushdown automaton, a write and a move for
 * a Turing machine.
 */

import { defaultStackAlphabet, defaultTapeAlphabet } from '../../../src/engine/validate';
import { EPSILON } from '../../../src/engine/types';
import type { Level, Machine, Move, Transition } from '../../../src/engine/types';
import { fill, h, on } from '../dom';

export interface RuleDraft {
  read: string;
  pop?: string;
  push?: string;
  write?: string;
  move?: Move;
}

export interface RuleEditorOptions {
  level: Level;
  machine: Machine;
  from: string;
  to: string;
  /** Present when editing; absent when adding. */
  existing?: Transition;
  onCommit: (draft: RuleDraft) => void;
  onDelete?: () => void;
}

const labelOf = (machine: Machine, id: string): string =>
  machine.states.find((s) => s.id === id)?.label ?? '?';

/** A row of choices. One is selected; picking another swaps the selection. */
function choices(
  legend: string,
  options: readonly string[],
  selected: string,
  onPick: (value: string) => void,
  testId: string,
): { el: HTMLElement; get: () => string } {
  let value = selected;
  const buttons = new Map<string, HTMLButtonElement>();
  const row = h('div', { class: 'choice-row', 'data-testid': testId, role: 'radiogroup', 'aria-label': legend });

  const paint = (): void => {
    for (const [key, node] of buttons) {
      const on_ = key === value;
      node.classList.toggle('is-on', on_);
      node.setAttribute('aria-checked', String(on_));
    }
  };

  for (const option of options) {
    const node = h(
      'button',
      {
        class: 'choice t-mono',
        type: 'button',
        role: 'radio',
        'data-value': option,
        'aria-checked': String(option === value),
      },
      option,
    );
    on(node, 'click', () => {
      value = option;
      paint();
      onPick(option);
    });
    buttons.set(option, node);
    row.appendChild(node);
  }
  paint();

  return {
    el: h('div', { class: 'field' }, h('span', { class: 't-label' }, legend), row),
    get: () => value,
  };
}

export function buildRuleEditor(into: HTMLElement, options: RuleEditorOptions): void {
  const { level, machine, from, to, existing } = options;

  const draft: RuleDraft = {
    read: existing?.read ?? '',
    pop: existing?.pop,
    push: existing?.push,
    write: existing?.write,
    move: existing?.move,
  };

  const fields: HTMLElement[] = [];
  const readable =
    level.type === 'TM'
      ? defaultTapeAlphabet(level)
      : level.type === 'NFA' || level.type === 'PDA'
        ? [...level.alphabet, EPSILON]
        : [...level.alphabet];

  if (draft.read === '') draft.read = readable[0] ?? '';

  const read = choices('Read', readable, draft.read, (v) => (draft.read = v), 'field-read');
  fields.push(read.el);

  if (level.type === 'PDA') {
    const stack = [...defaultStackAlphabet(level), EPSILON];
    if (draft.pop === undefined) draft.pop = stack[0] ?? EPSILON;
    if (draft.push === undefined) draft.push = EPSILON;
    fields.push(choices('Pop', stack, draft.pop, (v) => (draft.pop = v), 'field-pop').el);
    fields.push(choices('Push', stack, draft.push, (v) => (draft.push = v), 'field-push').el);
  }

  if (level.type === 'TM') {
    const tape = defaultTapeAlphabet(level);
    if (draft.write === undefined) draft.write = draft.read;
    if (draft.move === undefined) draft.move = 'R';
    fields.push(choices('Write', tape, draft.write, (v) => (draft.write = v), 'field-write').el);
    fields.push(
      choices('Move', ['L', 'R'], draft.move, (v) => (draft.move = v as Move), 'field-move').el,
    );
  }

  const commit = h(
    'button',
    { class: 'action is-primary', type: 'button', 'data-testid': 'rule-commit' },
    existing ? 'Save rule' : 'Add rule',
  );
  on(commit, 'click', () => options.onCommit(draft));

  const row = h('div', { class: 'sheet-actions' }, commit);
  if (options.onDelete) {
    const remove = h(
      'button',
      { class: 'action is-danger', type: 'button', 'data-testid': 'rule-delete' },
      'Delete',
    );
    on(remove, 'click', () => options.onDelete?.());
    row.appendChild(remove);
  }

  fill(
    into,
    h(
      'p',
      { class: 't-mono rule-head', 'data-testid': 'rule-head' },
      `${labelOf(machine, from)} → ${labelOf(machine, to)}`,
    ),
    ...fields,
    row,
  );
}
