/**
 * A level.
 *
 * The layout is one document: the diagram, then the transition function, then
 * the grading, in that order down the page, with a dock pinned in the thumb
 * zone whose contents never change. Anything contextual floats inside the
 * diagram card instead, so the dock never moves under a finger already on its
 * way to it.
 *
 * Grading is live. There is no Run button, because the interesting question is
 * not "is it right now" but "what did that last edit do".
 */

import { runSuite } from '../../../src/engine/simulate';
import type { SuiteResult } from '../../../src/engine/simulate';
import { validate } from '../../../src/engine/validate';
import { LEVEL_BY_ID } from '../../../src/engine/levels';
import { withinCanvas } from '../../../src/engine/minimize';
import type { Level, Machine, StateId, TransitionId } from '../../../src/engine/types';
import { CANVAS } from '../../../src/engine/types';
import { h, on, setText } from '../dom';
import { flatten, setNotation } from '../notation';
import { game } from '../store';
import { success, warn } from '../haptics';
import { createDiagram } from '../components/diagram';
import type { Diagram, DiagramMode } from '../components/diagram';
import { createLedger } from '../components/ledger';
import { createSuite } from '../components/suite';
import { createTrace } from '../components/trace';
import { createSheet } from '../components/sheet';
import { buildRuleEditor } from '../components/ruleEditor';
import { buildNotes } from '../components/notes';
import type { NotesSection } from '../components/notes';
import { buildAnalysis } from '../components/analysis';
import type { AnalysisSection } from '../components/analysis';

const GRADE_DEBOUNCE_MS = 140;

export interface View {
  el: HTMLElement;
  destroy(): void;
}

export function createLevelView(levelId: string, navigate: (hash: string) => void): View {
  const level = LEVEL_BY_ID[levelId];
  return level ? levelView(level, navigate) : missingView(navigate);
}

function missingView(navigate: (hash: string) => void): View {
  const back = h('button', { class: 'action', type: 'button' }, 'Back to the levels');
  on(back, 'click', () => navigate('#/'));
  return {
    el: h(
      'main',
      { class: 'shell' },
      h('p', { class: 't-body' }, 'No such level.'),
      back,
    ),
    destroy() {},
  };
}

function levelView(level: Level, navigate: (hash: string) => void): View {
  const levelId = level.id;

  // -- local view state -----------------------------------------------------

  let mode: DiagramMode = 'select';
  let selectedState: StateId | null = null;
  let selectedEdge: string | null = null;
  let selectedTransitions: TransitionId[] = [];
  let highlighted: readonly TransitionId[] = [];
  let traceActive: readonly StateId[] = [];
  let gradeTimer: ReturnType<typeof setTimeout> | null = null;
  let suiteResult: SuiteResult = runSuite(game.machineFor(levelId), level);
  let announcedSolved = game.isSolved(levelId);

  const machine = (): Machine => game.machineFor(levelId);

  // -- header ---------------------------------------------------------------

  const back = h(
    'button',
    { class: 'link-back', type: 'button', 'data-testid': 'back' },
    '‹ Levels',
  );
  on(back, 'click', () => navigate('#/'));

  const title = h('h1', { class: 't-display' }, level.title);
  const goal = h('p', { class: 't-body goal', 'data-testid': 'goal' });
  setNotation(goal, level.goal);

  const solvedTag = h('span', { class: 't-label solved-tag', hidden: true }, 'Solved');

  const header = h(
    'header',
    { class: 'level-head' },
    h(
      'div',
      { class: 'level-head-row' },
      back,
      h('span', { class: 't-label muted' }, `Level ${level.index} of 12 · ${level.type}`),
      solvedTag,
    ),
    title,
    goal,
  );

  // -- diagram --------------------------------------------------------------

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
      if (first) {
        const t = machine().transitions.find((x) => x.id === first);
        selectedEdge = t ? `${t.from}->${t.to}` : null;
        if (t) openRuleEditor(t.from, t.to, first);
      }
      render();
    },
    onMoveState: (id, x, y) => game.moveState(levelId, id, x, y),
    onConnect: (from, to) => openRuleEditor(from, to, null),
    onRename: (id) => openRename(id),
    onBackgroundTap: () => {
      selectedState = null;
      selectedEdge = null;
      selectedTransitions = [];
      render();
    },
  });

  const fitButton = floatButton('Fit', 'fit', () => diagram.fit());
  const zoomIn = floatButton('+', 'zoom-in', () => diagram.zoomBy(1.25), 'Zoom in');
  const zoomOut = floatButton('−', 'zoom-out', () => diagram.zoomBy(1 / 1.25), 'Zoom out');

  const startButton = floatButton('Start', 'set-start', () => {
    if (selectedState) game.setStart(levelId, selectedState);
  });
  const acceptButton = floatButton('Accepting', 'toggle-accepting', () => {
    if (selectedState) game.toggleAccepting(levelId, selectedState);
  });
  const renameButton = floatButton('Rename', 'rename', () => {
    if (selectedState) openRename(selectedState);
  });
  const deleteButton = floatButton('Delete', 'delete-state', () => {
    if (selectedState) {
      game.deleteState(levelId, selectedState);
      selectedState = null;
    }
  });

  const stateActions = h(
    'div',
    { class: 'float float-state', 'data-testid': 'state-actions', hidden: true },
    startButton,
    acceptButton,
    renameButton,
    deleteButton,
  );

  const card = h(
    'div',
    { class: 'card', 'data-testid': 'diagram-card' },
    diagram.el,
    h('div', { class: 'float float-view' }, zoomOut, zoomIn, fitButton),
    stateActions,
    h('p', { class: 't-small muted hint-line', 'data-testid': 'canvas-hint' }),
  );

  const canvasHint = card.querySelector('.hint-line') as HTMLElement;

  // -- ledger, suite, trace -------------------------------------------------

  const ledger = createLedger({
    onHighlight: (ids) => {
      highlighted = ids;
      paintDiagram();
    },
    onActivate: (line) => {
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
  });

  const trace = createTrace({
    onActive: (states) => {
      traceActive = states;
      paintDiagram();
    },
    onClose: () => {
      traceActive = [];
      render();
    },
  });

  const suite = createSuite({
    onTrace: (input) => {
      trace.play(machine(), level, input);
      render();
    },
  });

  // -- sheets ---------------------------------------------------------------

  const ruleSheet = createSheet('rule-sheet');
  const notesSheet = createSheet('level-sheet');
  const analysisSheet = createSheet('analysis-sheet');

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

  function openNotes(section: NotesSection): void {
    buildNotes(notesSheet.body, level, machine(), section);
    notesSheet.open('Level notes');
  }

  function openAnalysis(section: AnalysisSection): void {
    buildAnalysis(analysisSheet.body, machine(), level, section, {
      onAdopt: (derived, description) => {
        game.replaceMachine(levelId, derived);
        analysisSheet.close();
        announce(`Canvas replaced with ${description}.`);
      },
    });
    analysisSheet.open('Analysis');
  }

  // -- dock -----------------------------------------------------------------

  function dockButton(
    label: string,
    testId: string,
    action: () => void,
    ariaLabel?: string,
  ): HTMLButtonElement {
    const node = h(
      'button',
      {
        class: 'dock-button',
        type: 'button',
        'data-testid': testId,
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
      label,
    );
    on(node, 'click', action);
    return node;
  }

  const addButton = dockButton(
    'Add',
    'add-state',
    () => {
      const current = machine();
      const spot = freeSpot(current);
      const id = game.addState(levelId, spot.x, spot.y);
      selectedState = id;
      render();
    },
    'Add state',
  );

  const connectButton = dockButton('Connect', 'connect', () => {
    mode = mode === 'connect' ? 'select' : 'connect';
    selectedState = null;
    render();
  });

  const tidyButton = dockButton('Tidy', 'tidy', () => game.tidy(levelId));
  const undoButton = dockButton('Undo', 'undo', () => game.undo(levelId));
  const redoButton = dockButton('Redo', 'redo', () => game.redo(levelId));
  const notesButton = dockButton('Notes', 'notes', () => openNotes('language'));
  const analyseButton = dockButton('Analyse', 'analyse', () => openAnalysis(
    level.type === 'NFA' ? 'subset' : level.type === 'DFA' ? 'minimal' : 'regex',
  ));
  const hintButton = dockButton('Hint', 'hint', () => openNotes('machine'));

  const dock = h(
    'nav',
    { class: 'dock', 'data-testid': 'dock', 'aria-label': 'Diagram tools' },
    h('div', { class: 'dock-row' }, addButton, connectButton, tidyButton, undoButton, redoButton),
    h('div', { class: 'dock-row' }, notesButton, analyseButton, hintButton),
  );

  // -- solved banner --------------------------------------------------------

  const solvedNote = h('p', { class: 't-body' });
  const nextButton = h(
    'button',
    { class: 'action is-primary', type: 'button', 'data-testid': 'next-level' },
    'Next level',
  );
  on(nextButton, 'click', () => {
    const next = game.nextLevel(levelId);
    navigate(next ? `#/level/${next.id}` : '#/');
  });
  const revealButton = h(
    'button',
    { class: 'action', type: 'button', 'data-testid': 'reveal' },
    'Show a worked solution',
  );
  on(revealButton, 'click', () => {
    game.reveal(levelId);
    diagram.fit();
    announce('The worked solution is on the canvas. This level is marked as shown.');
  });

  const banner = h(
    'section',
    { class: 'banner', 'data-testid': 'banner' },
    solvedNote,
    h('div', { class: 'sheet-actions' }, nextButton, revealButton),
  );

  const liveRegion = h('p', {
    class: 'visually-hidden',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'announce',
  });

  function announce(message: string): void {
    setText(liveRegion, message);
  }

  // -- assembly -------------------------------------------------------------

  const el = h(
    'main',
    { class: 'shell level-shell', 'data-testid': 'level-view', 'data-level': levelId },
    liveRegion,
    header,
    h(
      'div',
      { class: 'columns' },
      h('div', { class: 'col col-canvas' }, card, suite.el, trace.el),
      h('div', { class: 'col col-ledger' }, ledger.el, banner),
    ),
    dock,
    ruleSheet.el,
    notesSheet.el,
    analysisSheet.el,
  );

  // -- rendering ------------------------------------------------------------

  /** Only the parts that change on hover or during a trace. */
  function paintDiagram(): void {
    diagram.update({
      machine: machine(),
      kind: level.type,
      mode,
      selectedState,
      selectedEdge,
      activeStates: traceActive,
      activeTransitions: highlighted.length > 0 ? highlighted : selectedTransitions,
    });
  }

  function scheduleGrade(): void {
    if (gradeTimer) clearTimeout(gradeTimer);
    gradeTimer = setTimeout(() => {
      gradeTimer = null;
      const current = machine();
      suiteResult = runSuite(current, level);
      suite.update({
        machine: current,
        level,
        result: suiteResult,
        playing: trace.input,
      });
      paintSolved();
    }, GRADE_DEBOUNCE_MS);
  }

  function paintSolved(): void {
    const current = machine();
    if (suiteResult.solved) {
      if (!announcedSolved) {
        announcedSolved = true;
        success();
        announce(`Every test passes with ${current.states.length} states.`);
      }
      game.markSolved(levelId, current.states.length);
    } else if (announcedSolved && !game.isSolved(levelId)) {
      announcedSolved = false;
    }

    const solved = game.isSolved(levelId);
    const started = current.states.length > 0;
    solvedTag.hidden = !solved;

    if (started && suiteResult.error) {
      setText(
        solvedNote,
        'The machine is not well formed, so it was reported rather than simulated.',
      );
      solvedNote.className = 't-body fail';
      nextButton.hidden = true;
      revealButton.hidden = false;
    } else if (solved) {
      const best = game.progress.bestStates[levelId];
      const shown = game.wasShown(levelId);
      setText(
        solvedNote,
        `Solved with ${best ?? current.states.length} states, par ${level.par}.` +
          (shown ? ' Solved after showing the worked solution.' : ''),
      );
      solvedNote.className = 't-body pass';
      nextButton.hidden = game.nextLevel(levelId) === undefined;
      revealButton.hidden = true;
    } else {
      // Stuck is a normal state, and the worked solution has to stay reachable
      // from it without pretending something has gone wrong.
      setText(solvedNote, 'Not solved yet.');
      solvedNote.className = 't-body muted';
      nextButton.hidden = true;
      revealButton.hidden = false;
    }
  }

  function render(): void {
    const current = machine();
    paintDiagram();
    ledger.update({ machine: current, level, selected: selectedTransitions });

    stateActions.hidden = selectedState === null;
    if (selectedState !== null) {
      const isStart = current.start === selectedState;
      const accepting = current.accepting.includes(selectedState);
      startButton.classList.toggle('is-on', isStart);
      acceptButton.classList.toggle('is-on', accepting);
      acceptButton.setAttribute('aria-pressed', String(accepting));
      startButton.setAttribute('aria-pressed', String(isStart));
    }

    connectButton.classList.toggle('is-on', mode === 'connect');
    connectButton.setAttribute('aria-pressed', String(mode === 'connect'));
    undoButton.toggleAttribute('disabled', !game.canUndo(levelId));
    redoButton.toggleAttribute('disabled', !game.canRedo(levelId));

    setText(
      canvasHint,
      mode === 'connect'
        ? 'Connect: tap a state, then tap another. Tap the same one twice for a self loop.'
        : current.states.length === 0
          ? 'Tap the canvas to place a state, or use Add state.'
          : 'Drag to move. Drag from the rim to draw an arrow. Hold to rename.',
    );

    const report = validate(current, level);
    const started = current.states.length > 0;
    card.classList.toggle('is-broken', started && report.errors.length > 0);
    if (started && report.errors.length > 0 && !suiteResult.error) warn();

    scheduleGrade();
  }

  /** A spot inside the canvas that is not already occupied. */
  function freeSpot(current: Machine): { x: number; y: number } {
    const pad = CANVAS.stateRadius + CANVAS.padding;
    const columns = 3;
    for (let i = 0; i < 24; i++) {
      const x = pad + ((i % columns) + 0.5) * ((CANVAS.width - pad * 2) / columns);
      const y = pad + (Math.floor(i / columns) + 0.5) * 84;
      if (y > CANVAS.height - pad) break;
      const clash = current.states.some((s) => Math.hypot(s.x - x, s.y - y) < CANVAS.hitRadius * 1.6);
      if (!clash) return { x, y };
    }
    return { x: CANVAS.width / 2, y: CANVAS.height / 2 };
  }

  // -- wiring ---------------------------------------------------------------

  const unsubscribe = game.subscribe(() => render());

  const offKeys = on(window as unknown as EventTarget, 'keydown', ((event: KeyboardEvent) => {
    if (ruleSheet.isOpen || notesSheet.isOpen || analysisSheet.isOpen) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) game.redo(levelId);
      else game.undo(levelId);
      return;
    }
    if (event.key === 'Escape') {
      selectedState = null;
      selectedTransitions = [];
      mode = 'select';
      render();
      return;
    }
    if (event.key.toLowerCase() === 'c') {
      mode = mode === 'connect' ? 'select' : 'connect';
      render();
      return;
    }
    if (event.key.toLowerCase() === 'f') diagram.fit();
  }) as EventListener);

  // First paint, then frame the machine that was restored from storage.
  render();
  suite.update({ machine: machine(), level, result: suiteResult, playing: null });
  paintSolved();
  requestAnimationFrame(() => {
    if (!withinCanvas(machine())) diagram.fit();
  });

  document.title = `${level.title} · automata-k`;

  return {
    el,
    destroy() {
      unsubscribe();
      offKeys();
      trace.stop();
      diagram.destroy();
      if (gradeTimer) clearTimeout(gradeTimer);
    },
  };
}

function floatButton(
  label: string,
  testId: string,
  action: () => void,
  ariaLabel?: string,
): HTMLButtonElement {
  const node = h(
    'button',
    {
      class: 'float-button',
      type: 'button',
      'data-testid': testId,
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
    },
    flatten(label),
  );
  on(node, 'click', action);
  return node;
}
