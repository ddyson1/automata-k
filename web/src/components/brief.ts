/**
 * The brief, split across the chamber.
 *
 * What you are being asked floats in the chamber's top left corner: which
 * level this is, the question in plain English, and the language underneath
 * it. How the machine measures up — states drawn, par, arrows — sits in the
 * top right beside the way back to the climb.
 *
 * The two lists that define the level are the console's first tab, the suite.
 * They are also the grader, which is why there is no results band anywhere in
 * this app and no score to translate into a diagnosis: the thing you are
 * reading is the thing that changes. Each row carries a mark at its right:
 * a dot before it has run, a triangle while it runs, then a tick or a cross.
 *
 * It changes when asked. Every mark goes back to a dot the moment the machine
 * stops being the one that was run, because a tick that might no longer be
 * true is worse than no tick at all. Tapping a string runs that one string,
 * slowly, so the thing you are reading is also the thing you can step through.
 */

import { shortestCounterexample } from '../../../src/engine/simulate';
import type { SuiteResult } from '../../../src/engine/simulate';
import { scoreOf } from '../../../src/engine/minimize';
import type { Level, Machine, MachineKind } from '../../../src/engine/types';
import { EPSILON } from '../../../src/engine/types';
import { TOUCH, fill, h, on, setText } from '../dom';
import { setNotation } from '../notation';

export interface BriefCallbacks {
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
  /** The suite is being played: which row is running, and the rows already done. */
  running: { index: number; done: ReadonlySet<string> } | null;
  solved: boolean;
  /** Smallest state count this level has been solved with. */
  best: number | undefined;
  hasNext: boolean;
  /** Said in the corner instead of the level's number and class: a lesson's place. */
  kicker?: string;
  /** A lesson: finished rather than solved, and not measured against par. */
  lesson?: boolean;
}

export interface Brief {
  /** Which level this is, in the chamber's corner. */
  kicker: HTMLElement;
  /** What the level asks, in words and in set-builder. */
  statement: HTMLElement;
  /** States drawn against par, and arrows. */
  meter: HTMLElement;
  /** How the machine is doing. The console's foot. */
  mark: HTMLElement;
  /** The two lists that define the level, and grade it. The console's first tab. */
  body: HTMLElement;
  /** Run, and what comes next. */
  actions: HTMLElement;
  /** The strings in the order the suite plays them: accepted first. */
  order(level: Level): string[];
  update(state: BriefState): void;
}

const show = (w: string): string => (w === '' ? EPSILON : w);

const KIND: Record<MachineKind, string> = {
  DFA: 'finite',
  NFA: 'nondeterministic',
  PDA: 'pushdown',
  TM: 'Turing',
};

/** How to read a rule, for the classes whose rules have more than one part. */
const NOTATION_KEY: Partial<Record<MachineKind, string>> = {
  PDA: 'A rule a, X → Y reads a, takes X off the top of the stack and puts Y on. ε means nothing; $ is the bottom.',
  TM: 'A rule a → X, R reads a, writes X in its place and moves right. ⊔ is a blank cell.',
};

const pad = (n: number): string => String(n).padStart(2, '0');

export function createBrief(callbacks: BriefCallbacks): Brief {
  const kickerText = h('span', {});
  const solvedTag = h('span', { class: 'hud-solved' });
  const kicker = h('p', { class: 'hud-kicker', 'data-testid': 'kicker' }, kickerText, solvedTag);

  const question = h('h1', { class: 'hud-goal', 'data-testid': 'goal' });
  const language = h('code', { class: 'hud-set sel', 'data-testid': 'set-builder' });
  // Where a rule has more than one part, say once how to read it.
  const key = h('p', { class: 'hud-key', 'data-testid': 'notation-key', hidden: true });
  const statement = h(
    'div',
    { class: 'hud-statement', 'data-testid': 'statement' },
    question,
    language,
    key,
  );

  const meterStates = h('span', { class: 'meter-states' });
  const meterRest = h('span', {});
  const meter = h('p', { class: 'meter', 'data-testid': 'meter' }, meterStates, meterRest);

  const acceptList = h('ul', { class: 'verdicts', 'data-testid': 'accept-list' });
  const rejectList = h('ul', { class: 'verdicts', 'data-testid': 'reject-list' });

  const score = h('p', { class: 'brief-score', 'data-testid': 'score' });
  const why = h('p', { class: 'brief-why', 'data-testid': 'why' });

  const runLink = h(
    'button',
    { class: 'brief-link is-run', type: 'button', 'data-testid': 'run' },
    'Run suite',
  );
  on(runLink, 'click', () => callbacks.onRun());

  const nextLink = h(
    'button',
    { class: 'brief-link is-next', type: 'button', 'data-testid': 'next-level', hidden: true },
    'Next level',
    h('span', { 'aria-hidden': 'true' }, ' →'),
  );
  on(nextLink, 'click', () => callbacks.onNext());

  const body = h(
    'section',
    { class: 'brief suite', 'data-testid': 'brief' },
    h(
      'div',
      { class: 'suite-groups' },
      h('section', { class: 'suite-group' }, h('p', { class: 't-label' }, 'Must accept'), acceptList),
      h('section', { class: 'suite-group' }, h('p', { class: 't-label' }, 'Must reject'), rejectList),
    ),
  );

  const mark = h('div', { class: 'pane-mark', 'data-testid': 'pane-foot' }, score, why);

  const actions = h(
    'div',
    { class: 'pane-actions', 'data-testid': 'pane-actions' },
    runLink,
    nextLink,
  );

  const order = (level: Level): string[] => [
    ...level.tests.filter((w) => level.accepts(w)),
    ...level.tests.filter((w) => !level.accepts(w)),
  ];

  /** Rows are rebuilt only when the level changes; the marks update in place. */
  let builtFor = '';
  const rows = new Map<string, { node: HTMLLIElement; mark: HTMLElement }>();

  function buildRows(level: Level): void {
    if (builtFor === level.id) return;
    builtFor = level.id;
    rows.clear();

    const make = (word: string): HTMLLIElement => {
      const glyph = h('span', { class: 'mark', 'aria-hidden': 'true' }, '·');
      const want = level.accepts(word) ? 'accepted' : 'rejected';
      const node = h(
        'li',
        { class: 'verdict is-blank', 'data-testid': 'verdict' },
        h(
          'button',
          {
            class: 'verdict-hit',
            type: 'button',
            'data-input': word,
            'aria-label': `${show(word)}, must be ${want}. Run it.`,
          },
          h('code', { class: 'verdict-word' }, show(word)),
          glyph,
        ),
      );
      on(node.firstElementChild as HTMLElement, 'click', () => callbacks.onTrace(word));
      rows.set(word, { node, mark: glyph });
      return node;
    };

    fill(acceptList, ...level.tests.filter((w) => level.accepts(w)).map(make));
    fill(rejectList, ...level.tests.filter((w) => !level.accepts(w)).map(make));
  }

  return {
    kicker,
    statement,
    meter,
    mark,
    body,
    actions,
    order,
    update(state) {
      const { level, result, running } = state;
      buildRows(level);

      setText(
        kickerText,
        state.kicker ?? `L${pad(level.index)} · ${level.title} · ${KIND[level.type]}`,
      );
      setText(solvedTag, state.solved ? (state.lesson ? ' · done' : ' · solved') : '');
      setNotation(question, level.goal);
      setNotation(language, level.setBuilder);
      const reading = NOTATION_KEY[level.type];
      key.hidden = !reading;
      if (reading) setText(key, reading);

      // States as par counts them: on a DFA level a missing arrow goes to a
      // dead state, so leaving it implicit still counts it.
      const s = scoreOf(state.machine, level);
      setText(meterStates, `States ${s.drawn}${s.impliedDead ? ' + 1' : ''}`);
      meterStates.classList.toggle('is-over', s.scored > level.par);
      meterStates.title = s.impliedDead
        ? `${s.drawn} drawn, and the dead state their missing arrows go to`
        : '';
      setText(meterRest, ` / par ${level.par} · arrows ${state.machine.transitions.length}`);

      // A mark is only shown for a result that is still true of what is on
      // the canvas. After an edit every one goes back to the dot: not "wrong",
      // not "right", but not asked yet.
      const started = state.machine.states.length > 0;
      const known = started && !state.stale;
      const now = running ? order(level)[running.index] : undefined;
      for (const row of result.rows) {
        const entry = rows.get(row.input);
        if (!entry) continue;
        const shown = running ? running.done.has(row.input) : known;
        const ok = row.pass;
        const isRunning = row.input === now;
        entry.node.classList.toggle('is-off', shown && !ok);
        entry.node.classList.toggle('is-blank', !shown && !isRunning);
        entry.node.classList.toggle('is-running', isRunning);
        entry.node.classList.toggle('is-playing', state.playing === row.input || isRunning);
        setText(entry.mark, isRunning ? '▸' : !shown ? '·' : ok ? '✓' : '✗');
      }

      // The verdict lives in the mark, so the mark carries the state. Idle
      // means no run has happened that is still true of this machine.
      mark.classList.toggle('is-solved', known && result.solved && !running);
      mark.classList.toggle('is-broken', known && Boolean(result.error) && !running);
      mark.classList.toggle('is-idle', !known);

      if (running) {
        setText(score, `Running ${running.index + 1} of ${result.total}`);
        setText(why, `${running.done.size} done.`);
      } else if (!started) {
        setText(score, 'Nothing drawn yet');
        setText(
          why,
          TOUCH
            ? 'Tap the chamber twice to place a state.'
            : 'Double click the chamber to place a state.',
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
        setText(score, `All ${result.total} agree`);
        setText(
          why,
          state.lesson
            ? 'The machine accepts exactly what the language asks for.'
            : `${s.drawn} ${s.drawn === 1 ? 'state' : 'states'}` +
                (s.impliedDead ? ' and the dead state they imply' : '') +
                `, par ${level.par}.`,
        );
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
      runLink.disabled = running !== null;
      runLink.classList.toggle('is-primary', state.stale || !(state.solved && state.hasNext));
      setText(runLink, state.stale ? 'Run suite' : 'Run again');
      nextLink.hidden = !(state.solved && state.hasNext) || running !== null;
    },
  };
}
