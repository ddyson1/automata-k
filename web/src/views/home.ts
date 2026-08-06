/**
 * The level list.
 *
 * Twelve rows climbing the hierarchy, grouped by machine class, each showing
 * the language it asks for. Locked levels stay visible and stay readable: the
 * shape of the whole climb is the point, and hiding the top of it would make
 * the game smaller than the subject.
 */

import { LEVELS, isUnlocked } from '../../../src/engine/levels';
import type { Level, MachineKind } from '../../../src/engine/types';
import { h, on, setText } from '../dom';
import { notation } from '../notation';
import { setSound, soundOn } from '../sound';
import { game } from '../store';
import type { ThemeChoice } from '../store';
import type { View } from './level';

const GROUPS: { kind: MachineKind; label: string; blurb: string }[] = [
  {
    kind: 'DFA',
    label: 'Deterministic finite automata',
    blurb: 'One arrow per symbol per state. Finite memory, and nothing else.',
  },
  {
    kind: 'NFA',
    label: 'Nondeterministic finite automata',
    blurb: 'Guessing, and epsilon moves. The same languages, drawn smaller.',
  },
  {
    kind: 'PDA',
    label: 'Pushdown automata',
    blurb: 'One unbounded stack. Enough to match nesting, not enough to count twice.',
  },
  {
    kind: 'TM',
    label: 'Turing machines',
    blurb: 'A tape you can rewrite and walk both ways. Every restriction is gone.',
  },
];

export function createHomeView(navigate: (hash: string) => void): View {
  const solvedCount = h('span', { class: 't-mono-sm', 'data-testid': 'solved-count' });

  const themeButton = h(
    'button',
    { class: 'ghost', type: 'button', 'data-testid': 'theme' },
    'Theme',
  );
  on(themeButton, 'click', () => {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(game.theme) + 1) % order.length] as ThemeChoice;
    game.setTheme(next);
  });

  // The one sound the app makes, and a way to stop it making it.
  const soundButton = h(
    'button',
    { class: 'ghost', type: 'button', 'data-testid': 'sound' },
    soundOn() ? 'Sound on' : 'Sound off',
  );
  on(soundButton, 'click', () => {
    setSound(!soundOn());
    soundButton.textContent = soundOn() ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', String(soundOn()));
  });
  soundButton.setAttribute('aria-pressed', String(soundOn()));

  const resetButton = h(
    'button',
    { class: 'ghost', type: 'button', 'data-testid': 'reset' },
    'Reset progress',
  );
  let resetArmed = false;
  on(resetButton, 'click', () => {
    if (!resetArmed) {
      resetArmed = true;
      setText(resetButton, 'Tap again to erase everything');
      resetButton.classList.add('fail');
      window.setTimeout(() => {
        resetArmed = false;
        setText(resetButton, 'Reset progress');
        resetButton.classList.remove('fail');
      }, 4000);
      return;
    }
    resetArmed = false;
    setText(resetButton, 'Reset progress');
    resetButton.classList.remove('fail');
    game.resetProgress();
  });

  const list = h('div', { class: 'levels' });

  const el = h(
    'main',
    { class: 'shell home-shell', 'data-testid': 'home-view' },
    h(
      'header',
      { class: 'home-head' },
      h('h1', { class: 't-display' }, 'automata-k'),
      h(
        'p',
        { class: 't-body muted' },
        'Draw a machine. It is graded against the language, not against an answer key. ' +
          'Twelve levels, from finite automata to Turing machines.',
      ),
      h(
        'div',
        { class: 'home-meta' },
        h('span', { class: 't-label' }, 'Solved'),
        solvedCount,
        themeButton,
        soundButton,
        resetButton,
      ),
    ),
    list,
    h(
      'footer',
      { class: 'home-foot t-small faint' },
      h(
        'p',
        {},
        'Progress is kept on this device only. No accounts, no analytics, no network calls. ' +
          'Typefaces are JetBrains Mono, Inter and Literata, all under the SIL Open Font License.',
      ),
    ),
  );

  function row(level: Level, unlocked: boolean): HTMLElement {
    const solved = game.isSolved(level.id);
    const shown = game.wasShown(level.id);
    const best = game.progress.bestStates[level.id];

    const setBuilder = h('code', { class: 't-mono-sm sel' });
    setBuilder.appendChild(notation(level.setBuilder));

    const status = solved
      ? `${best ?? level.par} states, par ${level.par}${shown ? ', shown' : ''}`
      : unlocked
        ? `par ${level.par}`
        : 'Locked';

    const node = h(
      'button',
      {
        class: `level-row${solved ? ' is-solved' : ''}${unlocked ? '' : ' is-locked'}`,
        type: 'button',
        'data-testid': 'level-row',
        'data-level': level.id,
        ...(unlocked ? {} : { disabled: true }),
        'aria-label': `Level ${level.index}, ${level.title}. ${status}.`,
      },
      h('span', { class: 't-mono-sm index' }, String(level.index).padStart(2, '0')),
      h(
        'span',
        { class: 'level-main' },
        h('span', { class: 't-title' }, level.title),
        setBuilder,
      ),
      h('span', { class: 't-small status' }, status),
      h('span', { class: 'tick', 'aria-hidden': 'true' }, solved ? '✓' : ''),
    );
    if (unlocked) on(node, 'click', () => navigate(`#/level/${level.id}`));
    return node;
  }

  function render(): void {
    setText(solvedCount, `${game.progress.solved.length}/${LEVELS.length}`);
    setText(
      themeButton,
      game.theme === 'system' ? 'Theme: system' : game.theme === 'light' ? 'Theme: light' : 'Theme: dark',
    );

    list.textContent = '';
    for (const group of GROUPS) {
      const levels = LEVELS.filter((l) => l.type === group.kind);
      if (levels.length === 0) continue;
      list.append(
        h(
          'div',
          { class: 'group-head' },
          h('span', { class: 't-label' }, group.label),
          h('p', { class: 't-small muted' }, group.blurb),
        ),
        ...levels.map((level) => row(level, isUnlocked(level, game.progress.solved))),
      );
    }
  }

  const unsubscribe = game.subscribe(render);
  render();
  document.title = 'automata-k';

  return {
    el,
    destroy() {
      unsubscribe();
    },
  };
}
