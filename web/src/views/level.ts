/**
 * A level, in the chamber.
 *
 * The whole window is one lit volume, and the machine hangs in it. What the
 * level asks floats in the top left corner; how the machine measures up, the
 * four tools and the way back to the climb sit in the top right. A glass
 * console stands on the right: its first tab is the suite, the strings that
 * must be accepted and rejected, and they are also the grader, so there is no
 * results band anywhere. Its other tabs hold the formal layer. The readout,
 * what the machine is reading and what it just did, runs along the bottom
 * left, and a pushdown machine's stack stands on the stage beside it.
 *
 * Running the suite is something you watch: every string goes through the
 * machine in turn, ticking off its row. A passing run ends on a card that
 * says what the theory says about the machine's size.
 *
 * A state is placed by double clicking — tapping twice, where there is no
 * mouse — an arrow is drawn by dragging off a rim, and the controls for a
 * state appear attached to that state when it is selected.
 *
 * On a wide window the console's left edge drags to resize it and a button
 * folds it away, both remembered (see paneSize.ts). On a phone the console is
 * a sheet along the bottom that opens over the chamber.
 *
 * The checks run when asked rather than on every keystroke. See runChecks.
 */

import { runSuite } from '../../../src/engine/simulate';
import { scoreOf } from '../../../src/engine/minimize';
import type { SuiteResult } from '../../../src/engine/simulate';
import { LEVELS, LEVEL_BY_ID } from '../../../src/engine/levels';
import { LESSONS, LESSON_BY_ID, type Lesson } from '../../../src/engine/lessons';
import type { Level, Machine, StateId, TransitionId } from '../../../src/engine/types';
import { CANVAS } from '../../../src/engine/types';
import { TOUCH, h, on, setText } from '../dom';
import { fitIcon, foldIcon, redoIcon, tidyIcon, undoIcon, unfoldIcon } from '../icons';
import { PANE_DEFAULT, PANE_MAX, PANE_MIN, clampPaneWidth, readPane, writePane } from '../paneSize';
import { game } from '../store';
import { storage } from '../storage';
import { reducedMotion, success, warn } from '../haptics';
import { chime } from '../sound';
import { createDiagram } from '../components/diagram';
import type { Diagram } from '../components/diagram';
import { createBrief } from '../components/brief';
import { createPanels } from '../components/panels';
import type { PaneTab } from '../components/panels';
import { createTrace } from '../components/trace';
import { createSheet } from '../components/sheet';
import { buildRuleEditor } from '../components/ruleEditor';
import { arriveAt, type Crossing } from '../components/crossing';
import { createResults } from '../components/results';
import { createMotes } from '../components/motes';
import { createCoach, predictionLine, type Coach } from '../components/coach';
import { createPredict } from '../components/predict';
import { SCRIPTS, type LessonScript, type Prediction, type RunSummary } from '../lessons';

export interface View {
  el: HTMLElement;
  destroy(): void;
}

/**
 * Everything about a machine that can change a verdict, and nothing else.
 *
 * Coordinates and labels are left out on purpose. Tidy rewrites every
 * coordinate and Rename rewrites a label, and neither can turn a tick into a
 * cross; losing a green run to having tidied the diagram would be a lie about
 * what the run measured.
 */
function signature(m: Machine): string {
  return JSON.stringify([
    m.states.map((s) => s.id).sort(),
    m.start,
    [...m.accepting].sort(),
    m.transitions
      .map((t) =>
        [t.from, t.to, t.read, t.pop ?? '', t.push ?? '', t.write ?? '', t.move ?? ''].join('\u0000'),
      )
      .sort(),
  ]);
}

export function createLevelView(levelId: string, navigate: (hash: string) => void): View {
  const level = LEVEL_BY_ID[levelId];
  return level ? levelView(level, navigate) : missingView(navigate);
}

/**
 * A lesson is a level with a starting machine, a coach, and only the tools it
 * is about. Everything else — the canvas, the suite, the trace — is the same
 * screen, so what a lesson teaches is what the levels will ask for.
 */
export function createLessonView(lessonId: string, navigate: (hash: string) => void): View {
  const lesson = LESSON_BY_ID[lessonId];
  const script = lesson ? SCRIPTS[lesson.id] : undefined;
  return lesson && script
    ? levelView(lesson.level, navigate, { lesson, script })
    : missingView(navigate);
}

function missingView(navigate: (hash: string) => void): View {
  const back = h('button', { class: 'action', type: 'button' }, 'Back to the climb');
  on(back, 'click', () => navigate('#/'));
  return {
    el: h('main', { class: 'shell' }, h('p', { class: 't-body' }, 'No such level.'), back),
    destroy() {},
  };
}

function levelView(
  level: Level,
  navigate: (hash: string) => void,
  lessonMode?: { lesson: Lesson; script: LessonScript },
): View {
  const levelId = level.id;
  const lesson = lessonMode?.lesson ?? null;
  const tools = lessonMode?.script.tools ?? null;
  // A lesson's script starts from its machine, so every visit does too.
  if (lesson) game.startLesson(levelId, lesson.start);

  let selectedState: StateId | null = null;
  let selectedEdge: string | null = null;
  let selectedTransitions: TransitionId[] = [];
  let highlighted: readonly TransitionId[] = [];
  let traceActive: readonly StateId[] = [];
  /** The rules the trace used to reach the step it is showing. */
  let traceVia: readonly TransitionId[] = [];
  let crossing: Crossing | null = null;
  let suiteResult: SuiteResult = runSuite(game.machineFor(levelId), level);
  /** The signature the current `suiteResult` was computed from. */
  let gradedAs: string | null = null;
  /** The machine has changed since the last run, so the marks are not current. */
  let stale = false;
  /** The suite is being played: the row running now, and the rows done. */
  let running: { index: number; done: Set<string> } | null = null;
  /** How long a pulse lasts while the suite plays: one step's worth. */
  let pulseMs = 420;

  // -- what a lesson's coach judges by ---------------------------------------
  /** The string fed in from the coach, one symbol per press. */
  let fed = '';
  let feeds = 0;
  const predictions: Prediction[] = [];
  const runs: RunSummary[] = [];
  /** A state the coach is pointing at. */
  let beckon: StateId | null = null;
  /** The string of a guess still playing, if one is. */
  let guessing: string | null = null;
  let coach: Coach | null = null;
  /** How many of the lesson's steps are done, so an edit can tell it finished one. */
  let stepsTaken = 0;

  const machine = (): Machine => game.machineFor(levelId);

  // -- canvas ---------------------------------------------------------------

  const diagram: Diagram = createDiagram({
    onSelectState: (id) => {
      selectedState = id;
      selectedEdge = null;
      selectedTransitions = [];
      render();
    },
    onSelectEdge: (ids) => {
      selectedTransitions = [...ids];
      selectedState = null;
      const first = ids[0];
      const t = first ? machine().transitions.find((x) => x.id === first) : undefined;
      selectedEdge = t ? `${t.from}->${t.to}` : null;
      if (t && first) openRuleEditor(t.from, t.to, first);
      render();
    },
    onMoveState: (id, x, y) => game.moveState(levelId, id, x, y),
    onConnect: (from, to) => openRuleEditor(from, to, null),
    onRename: (id) => openRename(id),
    onPlaceState: (x, y) => {
      const pad = CANVAS.stateRadius;
      const b = diagram.visibleBounds();
      const before = stepsTaken;
      const placed = game.addState(
        levelId,
        Math.min(b.x + b.w - pad, Math.max(b.x + pad, x)),
        Math.min(b.y + b.h - pad, Math.max(b.y + pad, y)),
      );
      // The new state is selected, unless placing it finished a lesson's step,
      // which has already cleared the way for the next one.
      selectedState = stepsTaken === before ? placed : null;
      diagram.bloom(placed, 'place');
      render();
    },
    onBackgroundTap: () => {
      selectedState = null;
      selectedEdge = null;
      selectedTransitions = [];
      render();
    },
    onAnchorMoved: () => placeStateBar(),
  });
  if (tools) {
    diagram.setAllowed({
      place: tools.place,
      connect: tools.connect,
      editRules: tools.editRules,
      rename: tools.rename,
    });
  }

  // -- the controls attached to a selected state ----------------------------

  function stateButton(label: string, testId: string, action: () => void): HTMLButtonElement {
    const node = h('button', { class: 'sb', type: 'button', 'data-testid': testId }, label);
    on(node, 'click', action);
    return node;
  }

  const startButton = stateButton('Start', 'set-start', () => {
    if (selectedState) game.setStart(levelId, selectedState);
  });
  const acceptButton = stateButton('Accepting', 'toggle-accepting', () => {
    const id = selectedState;
    if (!id) return;
    game.toggleAccepting(levelId, id);
    diagram.bloom(id, 'place');
  });
  const renameButton = stateButton('Rename', 'rename', () => {
    if (selectedState) openRename(selectedState);
  });
  const deleteButton = stateButton('Delete', 'delete-state', () => {
    if (!selectedState) return;
    game.deleteState(levelId, selectedState);
    selectedState = null;
  });

  const stateBar = h(
    'div',
    { class: 'state-bar', 'data-testid': 'state-bar', hidden: true },
    startButton,
    acceptButton,
    renameButton,
    deleteButton,
  );
  // A lesson shows only the controls it is about, and none at all if it is
  // about none of them.
  if (tools) {
    startButton.hidden = !tools.start;
    acceptButton.hidden = !tools.accepting;
    renameButton.hidden = !tools.rename;
    deleteButton.hidden = !tools.remove;
  }
  const stateTools = !tools || tools.start || tools.accepting || tools.rename || tools.remove;

  /** Keep the bar under the state it belongs to, and inside the stage. */
  function placeStateBar(): void {
    if (selectedState === null) return;
    const at = diagram.screenPointOf(selectedState);
    const box = stage.getBoundingClientRect();
    if (!at || box.width === 0) return;
    const w = stateBar.offsetWidth || 240;
    const hgt = stateBar.offsetHeight || 34;
    const x = Math.min(box.width - w - 10, Math.max(10, at.x - box.left - w / 2));
    // Above the state by preference: below is where the next arrow usually goes.
    let y = at.y - box.top - at.r - hgt - 16;
    if (y < 8) y = at.y - box.top + at.r + 16;
    stateBar.style.transform = `translate(${x.toFixed(1)}px, ${Math.min(box.height - hgt - 8, y).toFixed(1)}px)`;
  }

  // -- the four tools ---------------------------------------------------------

  /**
   * A tool, with its name attached.
   *
   * Four drawn glyphs and no words is a quiz. `title` is not the answer: the
   * browser's own tooltip takes about a second to appear, cannot be styled to
   * look like it belongs here, and never appears at all on a touch screen,
   * which is the case that needs it most. So the label is drawn by the app —
   * on hover and on keyboard focus where there is a pointer, and as a brief
   * flash after the press where there is not, which is the only moment a
   * touch device can be told anything.
   */
  function cornerButton(
    label: string,
    testId: string,
    glyph: SVGElement,
    action: () => void,
  ): HTMLButtonElement {
    const node = h(
      'button',
      {
        class: 'corner-b tip',
        type: 'button',
        'data-testid': testId,
        'aria-label': label,
        // Read by CSS, not by a screen reader: aria-label already says this,
        // and a reader that met both would say it twice.
        'data-tip': label,
      },
      glyph,
    );
    on(node, 'click', () => {
      action();
      if (TOUCH) flashTip(node);
    });
    return node;
  }

  /**
   * Say what the button just did, once, where there is no hover to say it.
   *
   * The canvas hint stands down while it is up: on a phone both sit just above
   * the tool pill, and two lines of small type on top of each other are worse
   * than either alone.
   */
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  function flashTip(node: HTMLElement): void {
    if (tipTimer) clearTimeout(tipTimer);
    for (const other of corner.children) other.classList.remove('is-saying');
    node.classList.add('is-saying');
    stage.classList.add('is-tipping');
    tipTimer = setTimeout(() => {
      node.classList.remove('is-saying');
      stage.classList.remove('is-tipping');
    }, 1500);
  }

  const undoButton = cornerButton('Undo', 'undo', undoIcon(), () => game.undo(levelId));
  const redoButton = cornerButton('Redo', 'redo', redoIcon(), () => game.redo(levelId));
  const tidyButton = cornerButton('Arrange the diagram', 'tidy', tidyIcon(), () => {
    // Each state travels to its new place, so the eye can follow where it went.
    diagram.glide();
    game.tidy(levelId);
    requestAnimationFrame(() => diagram.fit());
  });
  const fitButton = cornerButton('Centre and fit to the screen', 'fit', fitIcon(), () =>
    diagram.fit(),
  );

  const corner = h('div', { class: 'corner' }, undoButton, redoButton, tidyButton, fitButton);
  const canvasHint = h('p', { class: 'canvas-hint', 'data-testid': 'canvas-hint' });

  // With the console folded away on a wide window, this is the way back. It
  // sits where the console's own fold button was, so the two read as one.
  const paneUnfold = h(
    'button',
    {
      class: 'pane-unfold tip',
      type: 'button',
      'data-testid': 'pane-unfold',
      'aria-label': 'Show the console',
      'data-tip': 'Show the console',
      'aria-expanded': 'false',
    },
    unfoldIcon(),
  );

  // The one cost of a canvas with no toolbar is that nothing says you can draw
  // on it. An empty chamber says it, in the middle, where the eye already is.
  const emptyPrompt = h(
    'div',
    { class: 'empty-prompt', 'data-testid': 'empty-prompt', hidden: true },
    h('span', { class: 'empty-ring', 'aria-hidden': 'true' }),
    h(
      'p',
      { class: 't-body' },
      TOUCH
        ? 'Tap twice here to place your first state'
        : 'Double click here to place your first state',
    ),
  );

  // A passing or failing suite washes the chamber with its colour, briefly.
  const tint = h('div', { class: 'tint', 'aria-hidden': 'true' });
  function flashTint(kind: 'pass' | 'fail'): void {
    if (reducedMotion()) return;
    tint.classList.remove('is-pass', 'is-fail');
    void tint.offsetWidth;
    tint.classList.add(kind === 'pass' ? 'is-pass' : 'is-fail');
  }

  const motes = createMotes();

  // -- trace ----------------------------------------------------------------

  const trace = createTrace({
    onActive: (states, via = [], stepped = false) => {
      traceActive = states;
      traceVia = via;
      paintDiagram();
      // The rule just used runs along its arrow into the state it lit, as
      // fast as the run that used it.
      if (stepped) diagram.pulse(via, running ? Math.max(120, pulseMs) : undefined);
    },
    onClose: () => {
      traceActive = [];
      traceVia = [];
      fed = '';
      abandonGuess();
      render();
    },
  });

  // -- predict, then run -------------------------------------------------------

  const predict = createPredict({ onStopAsking: () => game.setPredict(false) });

  /** A guess whose string will not now reach its end can be called again. */
  function abandonGuess(): void {
    if (guessing === null) return;
    guessing = null;
    coach?.cancel();
  }

  /** Play a string, as tapping its row always has. */
  function watch(input: string): void {
    abandonGuess();
    trace.play(machine(), level, input, { autoplay: !reducedMotion() });
    render();
  }

  /** Play a string with the verdict kept back until the end, then say how the guess went. */
  function guess(input: string, said: boolean): void {
    abandonGuess();
    guessing = input;
    const played = trace.play(machine(), level, input, {
      autoplay: !reducedMotion(),
      // Without motion there is nothing to watch, so the answer comes at once.
      atEnd: reducedMotion(),
      holdVerdict: true,
      onEnd: (result) => {
        guessing = null;
        const frames = result.frames;
        const stuck = frames.length > 1 && (frames.at(-1)?.active.length ?? 0) === 0;
        const ids = (stuck ? frames.at(-2) : frames.at(-1))?.active ?? [];
        const labels = ids.map((id) => machine().states.find((s) => s.id === id)?.label ?? id);
        const p: Prediction = {
          input,
          said,
          accepted: result.accepted,
          stuck,
          where: labels.join(', ') || 'nowhere',
        };
        predictions.push(p);
        const { right, text } = predictionLine(p);
        trace.remark(text, right ? 'pass' : 'fail');
        feedCoach();
      },
    });
    if (!played) abandonGuess();
    render();
  }

  // -- feeding a lesson's machine, one symbol at a time -----------------------

  function feed(symbol: string): void {
    abandonGuess();
    fed += symbol;
    feeds++;
    trace.play(machine(), level, fed, { atEnd: true });
    render();
  }

  function clearFeed(): void {
    abandonGuess();
    fed = '';
    trace.play(machine(), level, '', { atEnd: true });
    render();
  }

  function feedCoach(): void {
    coach?.update({ machine: machine(), fed, feeds, predictions, runs });
  }

  function finishLesson(): void {
    if (!lesson) return;
    game.completeLesson(lesson.id);
    success();
    chime();
    flashTint('pass');
    announce(`Lesson ${lesson.index} done. ${lesson.takeaway}`);
  }

  // -- the console ------------------------------------------------------------

  const ruleSheet = createSheet('rule-sheet');

  const panels = createPanels({
    onHighlight: (ids) => {
      highlighted = ids;
      paintDiagram();
    },
    onActivateRule: (line) => {
      const first = line.transitionIds[0];
      if (first) {
        const t = machine().transitions.find((x) => x.id === first);
        if (t) {
          selectedTransitions = [...line.transitionIds];
          openRuleEditor(t.from, t.to, first);
          render();
          return;
        }
      }
      // A gap: the same editor, pre-aimed at the symbol that is missing.
      openRuleEditor(line.from, line.from, null, line.symbol);
    },
    onAdopt: (derived, description) => {
      game.replaceMachine(levelId, derived);
      showCanvas();
      announce(`Canvas replaced with ${description}.`);
    },
    onClear: () => {
      game.clear(levelId);
      selectedState = null;
      selectedTransitions = [];
      showCanvas();
      announce('The canvas is empty. Undo puts it back.');
    },
    onReveal: () => {
      game.reveal(levelId);
      showCanvas();
      announce('The worked solution is on the canvas.');
    },
  });

  /** On to the next level, by way of its floor's crossing if it has one. */
  function goNext(): void {
    const next = game.nextLevel(levelId);
    if (!next) {
      navigate('#/');
      return;
    }
    // Finishing a floor's last level is the usual way onto the next floor,
    // so its crossing plays here as well as from the climb.
    crossing?.destroy();
    crossing = arriveAt(next, el, () => {
      crossing = null;
      navigate(`#/level/${next.id}`);
    });
  }

  const brief = createBrief({
    onTrace: (input) => {
      stopShow();
      // You asked a question about the machine, so get out of the machine's
      // way. On a phone the console closes back to its bar.
      togglePane(false);
      // Ask first what you expect, while the marks do not already say.
      const known = gradedAs !== null && signature(machine()) === gradedAs;
      if ((lesson !== null || game.predict) && !known) {
        abandonGuess();
        // The question goes where the string will play, so nothing else is there.
        trace.stop();
        predict.ask(input, (said) => (said === null ? watch(input) : guess(input, said)));
        render();
        return;
      }
      // One string, slowly, the way the suite runs them all quickly.
      watch(input);
    },
    onRun: () => runChecks(),
    onNext: () => goNext(),
  });

  const results = createResults({ onNext: () => goNext(), onClimb: () => navigate('#/') });

  // The tabs the console can be in. The suite is one of them rather than the
  // thing the others cover up, which is what lets the foot stay put: whichever
  // tab is open, the verdict and Run are below it.
  const TABS: { key: PaneTab; label: string }[] = [
    { key: 'brief', label: 'Suite' },
    { key: 'machine', label: 'Machine' },
    { key: 'theory', label: 'Theory' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'hint', label: 'Stuck' },
  ];

  let tab: PaneTab = 'brief';
  const tabButtons = new Map<PaneTab, HTMLButtonElement>();
  const tabStrip = h('nav', { class: 'pane-tabs', role: 'tablist' });

  for (const entry of TABS) {
    const node = h(
      'button',
      { class: 'pane-tab', type: 'button', role: 'tab', 'data-testid': `tab-${entry.key}` },
      entry.label,
    );
    on(node, 'click', () => setTab(entry.key));
    tabButtons.set(entry.key, node);
    tabStrip.appendChild(node);
  }

  const paneBody = h('div', { class: 'pane-body' }, brief.body, panels.el);

  // A phone only: the console is a bar along the bottom until opened.
  const paneGrab = h(
    'button',
    {
      class: 'pane-grab tip',
      type: 'button',
      'data-testid': 'pane-grab',
      'aria-label': 'Open the console',
      'data-tip': 'Open the console',
    },
    h('span', { class: 'pane-grab-i', 'aria-hidden': 'true' }, '⌃'),
  );

  // A wide window only: fold the console away and give the chamber everything.
  const paneFold = h(
    'button',
    {
      class: 'pane-fold tip',
      type: 'button',
      'data-testid': 'pane-fold',
      'aria-label': 'Fold the console away',
      'data-tip': 'Fold the console away',
      'aria-expanded': 'true',
    },
    foldIcon(),
  );

  // The console's left edge, which can be dragged. A separator in ARIA terms,
  // so it also answers to the arrow keys, Home and End.
  const paneResize = h('div', {
    class: 'pane-resize',
    role: 'separator',
    tabindex: 0,
    'aria-orientation': 'vertical',
    'aria-label': 'Resize the console',
    'aria-valuemin': PANE_MIN,
    'aria-valuemax': PANE_MAX,
    'data-testid': 'pane-resize',
  });

  const consoleFoot = h('div', { class: 'console-foot' }, brief.mark, brief.actions, paneGrab);

  const pane = h(
    'aside',
    { class: 'pane console', 'data-testid': 'pane', 'aria-label': 'Console' },
    tabStrip,
    paneBody,
    consoleFoot,
    paneFold,
    paneResize,
  );

  function togglePane(want?: boolean): void {
    const open = pane.classList.toggle('is-open', want);
    const label = open ? 'Close the console' : 'Open the console';
    paneGrab.setAttribute('aria-label', label);
    paneGrab.setAttribute('data-tip', label);
    paneGrab.setAttribute('aria-expanded', String(open));
    setText(paneGrab.firstElementChild as HTMLElement, open ? '⌄' : '⌃');
  }

  on(paneGrab, 'click', (event) => {
    event.stopPropagation();
    togglePane();
  });

  function setTab(next: PaneTab): void {
    tab = next;
    for (const [key, node] of tabButtons) {
      const on_ = key === next;
      node.classList.toggle('is-on', on_);
      node.setAttribute('aria-selected', String(on_));
    }
    brief.body.hidden = next !== 'brief';
    panels.el.hidden = next === 'brief';
    pane.dataset.tab = next;
    // Highlighting belongs to the transition list; leaving it takes it away.
    if (next !== 'machine' && highlighted.length > 0) {
      highlighted = [];
      paintDiagram();
    }
    if (next !== 'brief') {
      panels.update({
        level,
        machine: machine(),
        selected: selectedTransitions,
        shownSolution: game.wasShown(levelId),
      });
      panels.show(next);
      togglePane(true);
    }
    paneBody.scrollTop = 0;
  }

  /** Something has just landed on the canvas. Go and look at it. */
  function showCanvas(): void {
    setTab('brief');
    togglePane(false);
    requestAnimationFrame(() => diagram.fit());
  }

  // -- the chamber's corners ---------------------------------------------------

  const back = h(
    'button',
    { class: 'climb-back', type: 'button', 'data-testid': 'back', 'aria-label': 'Back to the climb' },
    h('span', { 'aria-hidden': 'true' }, '←'),
    h('span', { class: 'climb-back-t' }, 'Climb'),
  );
  on(back, 'click', () => navigate('#/'));

  const nextLesson = lesson ? (LESSONS.find((l) => l.index === lesson.index + 1) ?? null) : null;
  coach =
    lesson && lessonMode
      ? createCoach(lesson, lessonMode.script, nextLesson, {
          onFeed: (symbol) => feed(symbol),
          onClear: () => clearFeed(),
          onPredict: (input, said) => {
            predict.close();
            guess(input, said);
          },
          onRun: () => runChecks(),
          onOnward: () =>
            navigate(nextLesson ? `#/lesson/${nextLesson.id}` : `#/level/${LEVELS[0]?.id ?? ''}`),
          onClimb: () => navigate('#/'),
          onDone: () => finishLesson(),
          onPoint: (state) => {
            beckon = state;
            paintDiagram();
          },
          // What was selected was for the step just done. Its controls would
          // otherwise sit over the canvas the next step needs, on a phone often
          // on the very state it asks for.
          onStep: () => {
            stepsTaken++;
            if (selectedState === null && selectedTransitions.length === 0) return;
            selectedState = null;
            selectedTransitions = [];
            stateBar.hidden = true;
            paintDiagram();
          },
        })
      : null;
  // A lesson's console is the suite and nothing else.
  if (lesson) tabStrip.hidden = true;

  const hud = h(
    'header',
    { class: 'hud', 'data-testid': 'hud' },
    brief.kicker,
    brief.statement,
    coach?.el ?? null,
  );
  const topbar = h('div', { class: 'topbar' }, corner, brief.meter, back);

  // -- sheets ---------------------------------------------------------------

  function openRuleEditor(
    from: StateId,
    to: StateId,
    existingId: TransitionId | null,
    preferredSymbol?: string,
  ): void {
    const current = machine();
    const existing = existingId
      ? current.transitions.find((t) => t.id === existingId)
      : undefined;
    buildRuleEditor(ruleSheet.body, {
      level,
      machine: current,
      from,
      to,
      ...(existing ? { existing } : {}),
      onCommit: (draft) => {
        if (existing) game.updateTransition(levelId, existing.id, draft);
        else game.addTransition(levelId, { from, to, ...draft });
        ruleSheet.close();
      },
      ...(existing
        ? {
            onDelete: () => {
              game.deleteTransition(levelId, existing.id);
              selectedTransitions = [];
              ruleSheet.close();
            },
          }
        : {}),
    });
    if (preferredSymbol !== undefined) {
      const pick = ruleSheet.body.querySelector(
        `[data-testid="field-read"] [data-value="${CSS.escape(preferredSymbol)}"]`,
      );
      (pick as HTMLButtonElement | null)?.click();
    }
    ruleSheet.open(existing ? 'Edit rule' : 'New rule');
  }

  function openRename(id: StateId): void {
    const state = machine().states.find((s) => s.id === id);
    if (!state) return;
    const input = h('input', {
      class: 't-mono rename-input',
      type: 'text',
      maxlength: '6',
      value: state.label,
      'aria-label': 'State label',
      'data-testid': 'rename-input',
    }) as HTMLInputElement;
    const save = h(
      'button',
      { class: 'action is-primary', type: 'button', 'data-testid': 'rename-save' },
      'Rename',
    );
    const commit = (): void => {
      game.renameState(levelId, id, input.value);
      ruleSheet.close();
    };
    on(save, 'click', commit);
    on(input, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') commit();
    });
    ruleSheet.body.textContent = '';
    ruleSheet.body.append(
      h('div', { class: 'field' }, h('span', { class: 't-label' }, 'Label'), input),
      h('div', { class: 'sheet-actions' }, save),
    );
    ruleSheet.open('Rename state');
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  // -- assembly -------------------------------------------------------------

  const liveRegion = h('p', {
    class: 'visually-hidden',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'announce',
  });

  function announce(message: string): void {
    setText(liveRegion, message);
  }

  const stage = h(
    'div',
    { class: 'stage', 'data-testid': 'stage' },
    motes.el,
    diagram.el,
    tint,
    emptyPrompt,
    hud,
    topbar,
    trace.memory,
    trace.el,
    predict.el,
    canvasHint,
    stateBar,
    pane,
    paneUnfold,
  );

  const el = h(
    'main',
    {
      class: `level kind-${level.type.toLowerCase()}${lesson ? ' is-lesson' : ''}`,
      'data-testid': lesson ? 'lesson-view' : 'level-view',
      'data-level': levelId,
    },
    liveRegion,
    stage,
    ruleSheet.el,
    results.el,
  );

  // -- console size -----------------------------------------------------------
  //
  // The stored width is what was asked for; what is applied is that, clamped
  // to this window, so a narrow window never squeezes the chamber and widening
  // it again gives the asked-for width back.

  const panePrefs = readPane(storage);

  function applyPaneWidth(): void {
    const width = clampPaneWidth(panePrefs.width, window.innerWidth);
    el.style.setProperty('--pane-w', `${width}px`);
    paneResize.setAttribute('aria-valuenow', String(width));
  }

  // Stores the request, bounded only by PANE_MIN/PANE_MAX; the window's own
  // ceiling is applied in applyPaneWidth, so widening the window restores it.
  function setPaneWidth(width: number, persist = true): void {
    panePrefs.width = clampPaneWidth(width, Number.POSITIVE_INFINITY);
    applyPaneWidth();
    if (persist) writePane(storage, panePrefs);
    placeStateBar();
  }

  function foldPane(collapsed: boolean, moveFocus = false): void {
    panePrefs.collapsed = collapsed;
    el.classList.toggle('is-collapsed', collapsed);
    paneFold.setAttribute('aria-expanded', String(!collapsed));
    paneUnfold.setAttribute('aria-expanded', String(!collapsed));
    writePane(storage, panePrefs);
    if (moveFocus) (collapsed ? paneUnfold : paneFold).focus();
    requestAnimationFrame(() => placeStateBar());
  }

  on(paneFold, 'click', (event) => {
    event.stopPropagation();
    foldPane(true, true);
  });
  on(paneUnfold, 'click', () => foldPane(false, true));

  // The handle is the console's left edge, so dragging it left widens it.
  let drag: { x: number; width: number } | null = null;
  on(paneResize, 'pointerdown', (event) => {
    const e = event as PointerEvent;
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, width: pane.getBoundingClientRect().width };
    paneResize.setPointerCapture(e.pointerId);
    el.classList.add('is-resizing');
  });
  on(paneResize, 'pointermove', (event) => {
    if (drag === null) return;
    setPaneWidth(drag.width - ((event as PointerEvent).clientX - drag.x), false);
  });
  const endDrag = (): void => {
    if (drag === null) return;
    drag = null;
    el.classList.remove('is-resizing');
    writePane(storage, panePrefs);
  };
  on(paneResize, 'pointerup', endDrag);
  on(paneResize, 'pointercancel', endDrag);
  on(paneResize, 'dblclick', () => setPaneWidth(PANE_DEFAULT));
  on(paneResize, 'keydown', (event) => {
    const e = event as KeyboardEvent;
    const step = e.shiftKey ? 64 : 16;
    const now = clampPaneWidth(panePrefs.width, window.innerWidth);
    const next =
      e.key === 'ArrowLeft'
        ? now + step
        : e.key === 'ArrowRight'
          ? now - step
          : e.key === 'Home'
            ? PANE_MIN
            : e.key === 'End'
              ? PANE_MAX
              : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setPaneWidth(next);
  });

  applyPaneWidth();
  foldPane(panePrefs.collapsed);

  // -- rendering ------------------------------------------------------------

  function paintDiagram(): void {
    diagram.update({
      machine: machine(),
      kind: level.type,
      selectedState,
      selectedEdge,
      activeStates: traceActive,
      activeTransitions:
        highlighted.length > 0
          ? highlighted
          : traceVia.length > 0
            ? traceVia
            : selectedTransitions,
      beckon,
    });
  }

  /**
   * Run the level's strings against what is drawn.
   *
   * Grading used to happen on a 140ms debounce after every edit, so the marks
   * were always live. Live is honest but it has no moment in it: the answer
   * arrives while you are still mid-thought, and by the time you look up it
   * has already been true for a while. On a press there is something to press,
   * something to watch, and something to hear.
   *
   * The verdict is computed at once; what takes time is showing it. Every
   * string goes through the machine on screen, its row ticking as it lands,
   * in about four seconds however long the suite. With reduced motion the
   * marks simply appear.
   *
   * `quiet` is for the run at startup, which is restoring a verdict rather
   * than reaching one.
   */
  function runChecks({ quiet = false } = {}): void {
    stopShow();
    abandonGuess();
    predict.close();
    const current = machine();
    suiteResult = runSuite(current, level);
    gradedAs = signature(current);
    stale = false;
    const watch =
      !quiet && !reducedMotion() && current.states.length > 0 && !suiteResult.error;
    if (watch) playShow(current);
    else settle(quiet);
  }

  function playShow(current: Machine): void {
    trace.stop();
    const inputs = brief.order(level);
    const steps = inputs.reduce((n, w) => n + w.length + 1, 0);
    const per = Math.round(Math.max(40, Math.min(150, 4200 / Math.max(1, steps + inputs.length * 2))));
    const show = { index: 0, done: new Set<string>() };
    running = show;
    pulseMs = Math.round(per * 1.6);
    togglePane(false);
    el.classList.add('is-showing');
    trace.playAll(current, level, inputs, {
      per,
      gap: Math.round(per * 1.5),
      onRow: (index, phase) => {
        if (running !== show) return;
        const word = inputs[index];
        if (phase === 'run') show.index = index;
        else if (word !== undefined) {
          show.done.add(word);
          const row = suiteResult.rows.find((r) => r.input === word);
          if (row) for (const id of traceActive) diagram.bloom(id, row.pass ? 'pass' : 'fail');
        }
        paintBrief();
      },
      onDone: () => {
        if (running !== show) return;
        running = null;
        el.classList.remove('is-showing');
        settle(false);
      },
    });
    paintBrief();
  }

  /** Stop the suite mid-show. The verdict it was showing stands. */
  function stopShow(): void {
    if (!running) return;
    running = null;
    el.classList.remove('is-showing');
    trace.stop();
  }

  function settle(quiet: boolean): void {
    const current = machine();
    // A lesson's run is something the coach is waiting for, not a level to
    // mark solved: the coach says what comes next.
    if (lesson) {
      if (!quiet) {
        runs.push({
          solved: suiteResult.solved,
          passed: suiteResult.passed,
          total: suiteResult.total,
          ...(suiteResult.error ? { error: suiteResult.error } : {}),
        });
        if (suiteResult.solved) flashTint('pass');
        else if (suiteResult.error) warn();
        else flashTint('fail');
        announce(`${suiteResult.passed} of ${suiteResult.total} agree.`);
      }
      paintBrief();
      feedCoach();
      return;
    }
    if (suiteResult.solved) {
      const again = game.isSolved(levelId);
      const score = scoreOf(current, level);
      game.markSolved(levelId, score.scored);
      if (!quiet) {
        success();
        chime();
        flashTint('pass');
        announce(
          `Every test agrees with ${score.drawn} states` +
            (score.impliedDead ? ' and the dead state they imply.' : '.'),
        );
        results.show({
          level,
          machine: current,
          again,
          hasNext: game.nextLevel(levelId) !== undefined,
        });
      }
    } else if (!quiet) {
      if (suiteResult.error) warn();
      else flashTint('fail');
      announce(`${suiteResult.passed} of ${suiteResult.total} agree.`);
    }
    paintBrief();
  }

  function paintBrief(): void {
    brief.update({
      level,
      machine: machine(),
      result: suiteResult,
      stale: stale && !running,
      playing: trace.input,
      running,
      solved: lesson ? game.isLessonDone(levelId) : game.isSolved(levelId),
      best: game.progress.bestStates[levelId],
      hasNext: !lesson && game.nextLevel(levelId) !== undefined,
      ...(lesson
        ? { kicker: `Lesson ${lesson.index} of ${LESSONS.length} · ${lesson.title}`, lesson: true }
        : {}),
    });
  }

  function render(): void {
    const current = machine();

    // An edit while the suite plays makes the show a show of the wrong machine.
    if (running && gradedAs !== null && signature(current) !== gradedAs) stopShow();

    paintDiagram();

    stateBar.hidden = selectedState === null || !stateTools;
    if (selectedState !== null) {
      const isStart = current.start === selectedState;
      const accepting = current.accepting.includes(selectedState);
      startButton.classList.toggle('is-on', isStart);
      acceptButton.classList.toggle('is-on', accepting);
      startButton.setAttribute('aria-pressed', String(isStart));
      acceptButton.setAttribute('aria-pressed', String(accepting));
      requestAnimationFrame(placeStateBar);
    }

    undoButton.toggleAttribute('disabled', !game.canUndo(levelId));
    redoButton.toggleAttribute('disabled', !game.canRedo(levelId));

    emptyPrompt.hidden = current.states.length > 0;
    setText(
      canvasHint,
      current.states.length === 0 || lesson
        ? ''
        : selectedState !== null
          ? 'Drag the grip to draw an arrow · hold a state to rename it'
          : TOUCH
            ? 'Tap twice to place a state · drag from a rim to connect'
            : 'Double click to place a state · drag from a rim to draw an arrow',
    );

    // Nothing but the readout belongs over the chamber's foot while a string
    // plays, and nothing but the question while one is about to.
    el.classList.toggle('is-tracing', trace.input !== null);
    el.classList.toggle('is-asking', predict.isOpen);

    stale = gradedAs === null || signature(current) !== gradedAs;

    if (tab !== 'brief') {
      panels.update({
        level,
        machine: current,
        selected: selectedTransitions,
        shownSolution: game.wasShown(levelId),
      });
    }

    paintBrief();
    feedCoach();
  }

  const unsubscribe = game.subscribe(() => render());

  const offKeys = on(window as unknown as EventTarget, 'keydown', ((event: KeyboardEvent) => {
    if (ruleSheet.isOpen || results.isOpen) return;
    if (event.key === 'Escape' && predict.isOpen) {
      predict.close();
      render();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) game.redo(levelId);
      else game.undo(levelId);
      return;
    }
    // Escape stops a show, then steps back through the console, then clears
    // the selection.
    if (event.key === 'Escape' && running) {
      stopShow();
      settle(true);
      return;
    }
    if (event.key === 'Escape' && tab !== 'brief') {
      setTab('brief');
      return;
    }
    if (event.key === 'Escape') {
      selectedState = null;
      selectedTransitions = [];
      render();
      return;
    }
    if (event.key === 'Backspace' && selectedState !== null && (!tools || tools.remove)) {
      event.preventDefault();
      game.deleteState(levelId, selectedState);
      selectedState = null;
      return;
    }
    if (event.key.toLowerCase() === 'f') diagram.fit();
  }) as EventListener);

  const offResize = on(window as unknown as EventTarget, 'resize', () => {
    applyPaneWidth();
    placeStateBar();
  });

  // The machine hangs below the question, and the question is as tall as its
  // words make it — one line on level 1, three on level 41 — so its height is
  // measured rather than assumed.
  // The question also stops short of the instruments in the top right, which
  // are as wide as their words.
  const hudWatch = new ResizeObserver(() => {
    stage.style.setProperty('--hud-h', `${Math.round(hud.getBoundingClientRect().height)}px`);
    stage.style.setProperty('--topbar-w', `${Math.round(topbar.getBoundingClientRect().width)}px`);
  });
  hudWatch.observe(hud);
  hudWatch.observe(topbar);

  setTab('brief');
  render();
  // Restore the verdict for whatever was in storage, without the fanfare. A
  // lesson starts with its marks blank: running the suite is one of its steps.
  if (!lesson) runChecks({ quiet: true });
  // Frame whatever was restored from storage, rather than trusting that the
  // authored coordinates suit this window.
  requestAnimationFrame(() => {
    if (machine().states.length > 0) diagram.fit();
  });

  document.title = `${lesson ? lesson.title : level.title} · automata-k`;

  return {
    el,
    destroy() {
      crossing?.destroy();
      predict.close();
      stopShow();
      results.close();
      unsubscribe();
      offKeys();
      offResize();
      hudWatch.disconnect();
      ruleSheet.destroy();
      trace.stop();
      motes.destroy();
      diagram.destroy();
    },
  };
}
