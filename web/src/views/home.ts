/**
 * The level select, which is the hierarchy.
 *
 * Four rings, nested the way the Chomsky classes are, and every level is a dot
 * inside the smallest ring that can hold its language. That is a picture the
 * old list could not draw: four of the tape levels hold context free languages
 * and sit in the context free ring carrying a tape mark, which says the thing
 * an ordered list cannot — a stronger machine, not a larger language.
 *
 * A dot is a number, so it needs a readout. Pointing at one on a desktop, or
 * tapping one on a phone, fills the strip below the rings with what it is; the
 * second press opens it. On a desktop the pointer arrives before the click, so
 * that is still one click. Nobody taps blind, and the strip is where the level
 * you are up to sits when nothing is selected.
 */

import { LEVELS, isUnlocked } from '../../../src/engine/levels';
import type { ChomskyType, Level, MachineKind } from '../../../src/engine/types';
import { h, on, setText } from '../dom';
import { notation } from '../notation';
import { setSound, soundOn } from '../sound';
import { game } from '../store';
import type { ThemeChoice } from '../store';
import type { View } from './level';

/** The rings, outermost first. Each holds the levels whose language it names. */
const RINGS: { type: ChomskyType; label: string }[] = [
  { type: 0, label: 'Type 0 · recursively enumerable' },
  { type: 1, label: 'Type 1 · context sensitive' },
  { type: 2, label: 'Type 2 · context free' },
  { type: 3, label: 'Type 3 · regular' },
];

/** What you draw, as opposed to what the ring says the language is. */
const MACHINES: { kind: MachineKind; mark: string; label: string }[] = [
  { kind: 'DFA', mark: '○', label: 'Deterministic finite automaton' },
  { kind: 'NFA', mark: '◍', label: 'Nondeterministic finite automaton' },
  { kind: 'PDA', mark: '▣', label: 'Pushdown automaton' },
  { kind: 'TM', mark: '▤', label: 'Turing machine' },
];

const MARK: Record<MachineKind, string> = Object.fromEntries(
  MACHINES.map((m) => [m.kind, m.mark]),
) as Record<MachineKind, string>;

const nn = (i: number): string => String(i).padStart(2, '0');

export function createHomeView(navigate: (hash: string) => void): View {
  const solvedCount = h('span', { class: 't-mono-sm', 'data-testid': 'solved-count' });

  const themeButton = h('button', { class: 'ghost', type: 'button', 'data-testid': 'theme' }, 'Theme');
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

  const rings = h('div', { class: 'rings', 'data-testid': 'rings' });

  // -- the readout ----------------------------------------------------------

  const readEyebrow = h('span', { class: 't-label' });
  const readTitle = h('p', { class: 'read-title' });
  const readLang = h('code', { class: 't-mono-sm sel read-lang' });
  const readMeta = h('p', { class: 't-small muted read-meta' });
  const readGo = h(
    'button',
    { class: 'brief-link is-next read-go', type: 'button', 'data-testid': 'readout-play' },
    'Play',
    h('span', { 'aria-hidden': 'true' }, '›'),
  );
  const readout = h(
    'div',
    { class: 'readout', 'data-testid': 'readout' },
    readEyebrow,
    readTitle,
    readLang,
    readMeta,
    readGo,
  );

  /** The level the readout is describing, and whether it can be entered. */
  let reading: Level | null = null;
  on(readGo, 'click', () => {
    if (reading && isUnlocked(reading, game.progress.solved)) navigate(`#/level/${reading.id}`);
  });

  function paintReadout(level: Level, pinned: boolean): void {
    reading = level;
    const unlocked = isUnlocked(level, game.progress.solved);
    const solved = game.isSolved(level.id);
    const best = game.progress.bestStates[level.id];
    const machine = MACHINES.find((m) => m.kind === level.type);

    setText(
      readEyebrow,
      pinned ? 'Where you left off' : `Level ${level.index} of ${LEVELS.length}`,
    );
    setText(readTitle, level.goal.replace(/\^([A-Za-z0-9])/g, '$1'));
    readLang.textContent = '';
    readLang.appendChild(notation(level.setBuilder));
    setText(
      readMeta,
      unlocked
        ? `${machine?.label ?? level.type} · par ${level.par}` +
            (solved ? ` · solved with ${best ?? level.par}` : '')
        : `${machine?.label ?? level.type} · locked until level ${level.index - 1} is solved`,
    );
    readGo.hidden = !unlocked;
    setText(readGo.firstChild as Node, solved ? 'Play again' : pinned ? 'Carry on' : 'Play');
    readout.classList.toggle('is-locked', !unlocked);
    for (const node of rings.querySelectorAll('.dot')) {
      node.classList.toggle('is-reading', node.getAttribute('data-level') === level.id);
    }
  }

  /** The level to show when nothing is selected: the first one not yet solved. */
  const upNext = (): Level =>
    LEVELS.find((l) => !game.isSolved(l.id)) ?? (LEVELS[LEVELS.length - 1] as Level);

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
          `${LEVELS.length} levels, from finite automata to Turing machines.`,
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
    rings,
    readout,
    h(
      'div',
      { class: 'legend' },
      h('span', { class: 't-label' }, 'You draw'),
      ...MACHINES.map((m) =>
        h(
          'span',
          { class: 'legend-item' },
          h('span', { class: 'legend-mark' }, m.mark),
          h('span', { class: 't-small muted' }, m.label),
        ),
      ),
    ),
    h(
      'p',
      { class: 't-small muted ring-note' },
      'A level sits in the smallest ring that can hold its language. Four of the tape ' +
        'levels sit in the context free ring, which is the argument of the last group: ' +
        'a stronger machine, not a larger language.',
    ),
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

  function dot(level: Level): HTMLElement {
    const unlocked = isUnlocked(level, game.progress.solved);
    const solved = game.isSolved(level.id);
    const status = solved ? 'solved' : unlocked ? `par ${level.par}` : 'locked';

    const node = h(
      'button',
      {
        class: `dot${solved ? ' is-solved' : ''}${unlocked ? '' : ' is-locked'}`,
        type: 'button',
        'data-testid': 'level-row',
        'data-level': level.id,
        // aria-disabled rather than disabled: a disabled button cannot take
        // focus, and a locked level that cannot be reached by keyboard cannot
        // explain what it is or what unlocks it. The click is guarded instead.
        ...(unlocked ? {} : { 'aria-disabled': 'true' }),
        'aria-label': `Level ${level.index}, ${level.title}, ${
          MACHINES.find((m) => m.kind === level.type)?.label ?? level.type
        }. ${status}.`,
      },
      h('span', { class: 'dot-n' }, nn(level.index)),
      h('span', { class: 'dot-m', 'aria-hidden': 'true' }, MARK[level.type]),
    );

    // Pointing at a dot reads it out; pressing one that is already being read
    // opens it. A mouse arrives before it clicks, so on a desktop that is one
    // click; a finger does not, so on a phone it is a look and then a tap.
    const read = (): void => paintReadout(level, false);
    on(node, 'pointerenter', (event) => {
      if ((event as PointerEvent).pointerType !== 'touch') read();
    });
    on(node, 'focus', read);
    on(node, 'click', () => {
      if (!unlocked) return;
      if (reading?.id === level.id) navigate(`#/level/${level.id}`);
      else read();
    });
    return node;
  }

  function render(): void {
    setText(solvedCount, `${game.progress.solved.length}/${LEVELS.length}`);
    setText(
      themeButton,
      game.theme === 'system'
        ? 'Theme: system'
        : game.theme === 'light'
          ? 'Theme: light'
          : 'Theme: dark',
    );

    // The rings are built inside out so each one can be put inside the last.
    let inner: HTMLElement | null = null;
    for (const ring of [...RINGS].reverse()) {
      const held = LEVELS.filter((l) => l.chomsky === ring.type);
      const box = h(
        'div',
        { class: `ring ring-${ring.type}`, 'data-testid': `ring-${ring.type}` },
        h('span', { class: 't-label ring-label' }, ring.label),
      );
      if (inner) box.appendChild(inner);
      if (held.length > 0) {
        box.appendChild(h('div', { class: 'dots' }, ...held.map(dot)));
      } else {
        box.appendChild(
          h('p', { class: 't-small faint ring-empty' }, 'Nothing here yet. There is room.'),
        );
      }
      inner = box;
    }
    rings.textContent = '';
    if (inner) rings.appendChild(inner);

    paintReadout(upNext(), true);
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
