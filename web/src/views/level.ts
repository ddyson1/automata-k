/**
 * A level, in the Brief direction.
 *
 * Two things on screen: the brief, and the canvas. The brief is the question in
 * plain English and the two lists that define the level, and those lists are
 * also the grader, so there is no results band anywhere. The canvas is
 * everything else, with no dock: a state is placed by double clicking, an arrow
 * is drawn by dragging off a rim, and the controls for a state appear attached
 * to that state when it is selected.
 *
 * Four quiet icons in the corner do the things that have no object to attach
 * to: undo, redo, tidy, fit. Everything formal is one disclosure away.
 */

import { runSuite } from '../../../src/engine/simulate';
import type { SuiteResult } from '../../../src/engine/simulate';
import { LEVEL_BY_ID } from '../../../src/engine/levels';
import type { Level, Machine, StateId, TransitionId } from '../../../src/engine/types';
import { CANVAS } from '../../../src/engine/types';
import { h, on, setText } from '../dom';
import { game } from '../store';
import { success } from '../haptics';
import { createDiagram } from '../components/diagram';
import type { Diagram } from '../components/diagram';
import { createBrief } from '../components/brief';
import { createOverlay } from '../components/overlay';
import type { OverlayTab } from '../components/overlay';
import { createTrace } from '../components/trace';
import { createSheet } from '../components/sheet';
import { buildRuleEditor } from '../components/ruleEditor';

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
    el: h('main', { class: 'shell' }, h('p', { class: 't-body' }, 'No such level.'), back),
    destroy() {},
  };
}

function levelView(level: Level, navigate: (hash: string) => void): View {
  const levelId = level.id;

  let selectedState: StateId | null = null;
  let selectedEdge: string | null = null;
  let selectedTransitions: TransitionId[] = [];
  let highlighted: readonly TransitionId[] = [];
  let traceActive: readonly StateId[] = [];
  let gradeTimer: ReturnType<typeof setTimeout> | null = null;
  let suiteResult: SuiteResult = runSuite(game.machineFor(levelId), level);
  let announcedSolved = game.isSolved(levelId);

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
      selectedState = game.addState(
        levelId,
        Math.min(CANVAS.width - pad, Math.max(pad, x)),
        Math.min(CANVAS.height - pad, Math.max(pad, y)),
      );
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
    if (selectedState) game.toggleAccepting(levelId, selectedState);
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

  /** Keep the bar under the state it belongs to, and inside the stage. */
  function placeStateBar(): void {
    if (selectedState === null) return;
    const at = diagram.screenPointOf(selectedState);
    const box = stage.getBoundingClientRect();
    if (!at || box.width === 0) return;
    const w = stateBar.offsetWidth || 240;
    const hgt = stateBar.offsetHeight || 34;
    const x = Math.min(box.width - w - 10, Math.max(10, at.x - box.left - w / 2));
    let y = at.y - box.top + at.r + 12;
    if (y + hgt > box.height - 40) y = at.y - box.top - at.r - hgt - 12;
    stateBar.style.transform = `translate(${x.toFixed(1)}px, ${Math.max(8, y).toFixed(1)}px)`;
  }

  // -- corner controls ------------------------------------------------------

  function cornerButton(
    label: string,
    testId: string,
    glyph: string,
    action: () => void,
  ): HTMLButtonElement {
    const node = h(
      'button',
      {
        class: 'corner-b',
        type: 'button',
        'data-testid': testId,
        'aria-label': label,
        title: label,
      },
      glyph,
    );
    on(node, 'click', action);
    return node;
  }

  const undoButton = cornerButton('Undo', 'undo', '↺', () => game.undo(levelId));
  const redoButton = cornerButton('Redo', 'redo', '↻', () => game.redo(levelId));
  const tidyButton = cornerButton('Tidy', 'tidy', '⊞', () => {
    game.tidy(levelId);
    requestAnimationFrame(() => diagram.fit());
  });
  const fitButton = cornerButton('Fit', 'fit', '⤢', () => diagram.fit());

  const corner = h('div', { class: 'corner' }, undoButton, redoButton, tidyButton, fitButton);
  const canvasHint = h('p', { class: 'canvas-hint', 'data-testid': 'canvas-hint' });

  // The one cost of a canvas with no toolbar is that nothing says you can draw
  // on it. An empty sheet says it, in the middle, where the eye already is.
  const emptyPrompt = h(
    'div',
    { class: 'empty-prompt', 'data-testid': 'empty-prompt', hidden: true },
    h('span', { class: 'empty-ring', 'aria-hidden': 'true' }),
    h('p', { class: 't-body' }, 'Double click here to place your first state'),
  );

  // -- trace ----------------------------------------------------------------

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

  const stage = h(
    'div',
    { class: 'stage', 'data-testid': 'stage' },
    diagram.el,
    emptyPrompt,
    corner,
    stateBar,
    canvasHint,
    trace.el,
  );

  // -- brief and overlay ----------------------------------------------------

  const ruleSheet = createSheet('rule-sheet');

  /** Whether the pane was already up before the overlay took it over. */
  let paneWasOpen = false;

  const overlay = createOverlay({
    onClose: () => {
      highlighted = [];
      // On a phone the pane is a sheet, and the overlay opened it. Put it back
      // where it was, or the machine that just arrived stays behind it.
      if (!paneWasOpen) pane.classList.remove('is-open');
      paintDiagram();
    },
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
      paneWasOpen = false;
      overlay.close();
      requestAnimationFrame(() => diagram.fit());
      announce(`Canvas replaced with ${description}.`);
    },
    onReveal: () => {
      game.reveal(levelId);
      // Whatever the pane was doing, the point now is to look at the canvas.
      paneWasOpen = false;
      overlay.close();
      requestAnimationFrame(() => diagram.fit());
      announce('The worked solution is on the canvas.');
    },
  });

  const brief = createBrief({
    onBack: () => navigate('#/'),
    onTrace: (input) => {
      trace.play(machine(), level, input);
      // You asked a question about the machine, so get out of the machine's
      // way. On a phone that means the brief drops back to peeking.
      pane.classList.remove('is-open');
      render();
    },
    onOpenMachine: () => openOverlay('machine'),
    onOpenHint: () => openOverlay('hint'),
    onNext: () => {
      const next = game.nextLevel(levelId);
      navigate(next ? `#/level/${next.id}` : '#/');
    },
  });

  const paneGrab = h('button', {
    class: 'pane-grab',
    type: 'button',
    'data-testid': 'pane-grab',
    'aria-label': 'Show the brief',
  });
  const pane = h('div', { class: 'pane', 'data-testid': 'pane' }, paneGrab, brief.el, overlay.el);
  on(paneGrab, 'click', () => {
    const open = pane.classList.toggle('is-open');
    paneGrab.setAttribute('aria-label', open ? 'Hide the brief' : 'Show the brief');
  });

  function openOverlay(tab: OverlayTab): void {
    paneWasOpen = pane.classList.contains('is-open');
    overlay.update({
      level,
      machine: machine(),
      selected: selectedTransitions,
      shownSolution: game.wasShown(levelId),
    });
    overlay.open(tab);
    pane.classList.add('is-open');
  }

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

  const el = h(
    'main',
    { class: 'level', 'data-testid': 'level-view', 'data-level': levelId },
    liveRegion,
    pane,
    stage,
    ruleSheet.el,
  );

  // -- rendering ------------------------------------------------------------

  function paintDiagram(): void {
    diagram.update({
      machine: machine(),
      kind: level.type,
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
      suiteResult = runSuite(machine(), level);
      paintBrief();
    }, GRADE_DEBOUNCE_MS);
  }

  function paintBrief(): void {
    const current = machine();
    if (suiteResult.solved) {
      if (!announcedSolved) {
        announcedSolved = true;
        success();
        announce(`Every test agrees with ${current.states.length} states.`);
      }
      game.markSolved(levelId, current.states.length);
    } else if (announcedSolved && !game.isSolved(levelId)) {
      announcedSolved = false;
    }

    brief.update({
      level,
      machine: current,
      result: suiteResult,
      playing: trace.input,
      solved: game.isSolved(levelId),
      best: game.progress.bestStates[levelId],
      hasNext: game.nextLevel(levelId) !== undefined,
    });
  }

  function render(): void {
    const current = machine();
    paintDiagram();

    stateBar.hidden = selectedState === null;
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
      current.states.length === 0
        ? ''
        : selectedState !== null
          ? 'Drag the grip to draw an arrow · hold a state to rename it'
          : 'Double click to place a state · drag from a rim to draw an arrow',
    );

    overlay.update({
      level,
      machine: current,
      selected: selectedTransitions,
      shownSolution: game.wasShown(levelId),
    });

    scheduleGrade();
  }

  const unsubscribe = game.subscribe(() => render());

  const offKeys = on(window as unknown as EventTarget, 'keydown', ((event: KeyboardEvent) => {
    if (ruleSheet.isOpen) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) game.redo(levelId);
      else game.undo(levelId);
      return;
    }
    if (overlay.isOpen) return;
    if (event.key === 'Escape') {
      selectedState = null;
      selectedTransitions = [];
      render();
      return;
    }
    if (event.key === 'Backspace' && selectedState !== null) {
      event.preventDefault();
      game.deleteState(levelId, selectedState);
      selectedState = null;
      return;
    }
    if (event.key.toLowerCase() === 'f') diagram.fit();
  }) as EventListener);

  const offResize = on(window as unknown as EventTarget, 'resize', () => placeStateBar());

  render();
  paintBrief();
  // Frame whatever was restored from storage, rather than trusting that the
  // authored coordinates suit this window.
  requestAnimationFrame(() => {
    if (machine().states.length > 0) diagram.fit();
  });

  document.title = `${level.title} · automata-k`;

  return {
    el,
    destroy() {
      unsubscribe();
      offKeys();
      offResize();
      trace.stop();
      diagram.destroy();
      if (gradeTimer) clearTimeout(gradeTimer);
    },
  };
}
