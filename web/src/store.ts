/**
 * Game state: the machine on the canvas per level, undo and redo, and progress.
 *
 * Positions committed here are the authoritative ones. During a drag the
 * diagram writes transform attributes straight onto its own SVG nodes and calls
 * moveState once, on release. Nothing in this module runs per frame.
 *
 * What you draw lives for the session and no longer than it. Drafts used to be
 * written to localStorage under their own key and read back on boot, so opening
 * a level could hand you a machine from a sitting you no longer remembered —
 * indistinguishable, on arrival, from a starting position the game had put
 * there. Every level now opens on a blank canvas. Moving between levels within
 * a session still keeps what you drew, because that is one train of thought;
 * a reload is a new one.
 *
 * Progress is a different thing and still persists: which levels are solved,
 * the smallest state count each was solved with, whether the answer was
 * revealed, the theme and the sound.
 */

import { layoutMachine } from '../../src/engine/layout';
import { LEVELS, isUnlocked } from '../../src/engine/levels';
import { solutionFor } from '../../src/engine/solutions';
import type {
  Level,
  Machine,
  StateId,
  Transition,
  TransitionId,
} from '../../src/engine/types';
import { storage } from './storage';

const PROGRESS_KEY = 'automata-k.progress.v1';
const THEME_KEY = 'automata-k.theme.v1';
/** Drafts are no longer saved. Anyone who has some from an older build gets them cleared. */
const STALE_DRAFTS_KEY = 'automata-k.drafts.v1';
const HISTORY_LIMIT = 60;
const PERSIST_DEBOUNCE_MS = 250;

export interface Progress {
  solved: string[];
  /** Levels solved after revealing the worked solution. */
  shownSolution: string[];
  /** Smallest state count the player has solved each level with. */
  bestStates: Record<string, number>;
}

interface Draft {
  machine: Machine;
  past: Machine[];
  future: Machine[];
}

export type ThemeChoice = 'system' | 'light' | 'dark';

const emptyMachine = (): Machine => ({
  states: [],
  transitions: [],
  start: null,
  accepting: [],
});

const emptyDraft = (): Draft => ({ machine: emptyMachine(), past: [], future: [] });

const cloneMachine = (m: Machine): Machine => ({
  states: m.states.map((s) => ({ ...s })),
  transitions: m.transitions.map((t) => ({ ...t })),
  start: m.start,
  accepting: [...m.accepting],
});

const nextId = (existing: readonly string[], prefix: string): string => {
  let n = 0;
  const taken = new Set(existing);
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

type Listener = () => void;

class Game {
  progress: Progress;
  theme: ThemeChoice;

  private drafts = new Map<string, Draft>();
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.progress = storage.read<Progress>(PROGRESS_KEY, {
      solved: [],
      shownSolution: [],
      bestStates: {},
    });
    this.progress.solved ??= [];
    this.progress.shownSolution ??= [];
    this.progress.bestStates ??= {};
    this.theme = storage.read<ThemeChoice>(THEME_KEY, 'system');

    // Nothing is restored onto a canvas. Sweeping the old key means a player
    // carrying drafts from an earlier build is not left holding bytes that
    // nothing will ever read again.
    storage.remove(STALE_DRAFTS_KEY);
  }

  // -- subscription ---------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  // -- persistence ----------------------------------------------------------

  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Write immediately. Called when the page is hidden, which may be the last chance. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    storage.write(PROGRESS_KEY, this.progress);
    storage.write(THEME_KEY, this.theme);
  }

  // -- reads ----------------------------------------------------------------

  machineFor(levelId: string): Machine {
    return this.drafts.get(levelId)?.machine ?? emptyMachine();
  }

  canUndo(levelId: string): boolean {
    return (this.drafts.get(levelId)?.past.length ?? 0) > 0;
  }

  canRedo(levelId: string): boolean {
    return (this.drafts.get(levelId)?.future.length ?? 0) > 0;
  }

  isSolved(levelId: string): boolean {
    return this.progress.solved.includes(levelId);
  }

  wasShown(levelId: string): boolean {
    return this.progress.shownSolution.includes(levelId);
  }

  unlockedLevels(): Level[] {
    return LEVELS.filter((l) => isUnlocked(l, this.progress.solved));
  }

  nextLevel(levelId: string): Level | undefined {
    const current = LEVELS.find((l) => l.id === levelId);
    if (!current) return undefined;
    return LEVELS.find((l) => l.index === current.index + 1);
  }

  // -- edits ----------------------------------------------------------------

  /** Apply an edit, pushing the previous machine onto the undo stack. */
  private edit(levelId: string, fn: (m: Machine) => void): void {
    const draft = this.drafts.get(levelId) ?? emptyDraft();
    const before = cloneMachine(draft.machine);
    const after = cloneMachine(draft.machine);
    fn(after);
    this.drafts.set(levelId, {
      machine: after,
      past: [...draft.past, before].slice(-HISTORY_LIMIT),
      future: [],
    });
    // No persist: the canvas is session state. Only progress and preferences
    // reach storage, and those have their own callers.
    this.emit();
  }

  addState(levelId: string, x: number, y: number): StateId {
    const existing = this.machineFor(levelId);
    const id = nextId(existing.states.map((s) => s.id), 's');
    const label = nextId(existing.states.map((s) => s.label), 'q');
    this.edit(levelId, (m) => {
      m.states.push({ id, label, x, y });
      if (m.start === null) m.start = id;
    });
    return id;
  }

  moveState(levelId: string, id: StateId, x: number, y: number): void {
    this.edit(levelId, (m) => {
      const s = m.states.find((n) => n.id === id);
      if (s) {
        s.x = x;
        s.y = y;
      }
    });
  }

  renameState(levelId: string, id: StateId, label: string): void {
    const trimmed = label.trim().slice(0, 6);
    if (trimmed.length === 0) return;
    this.edit(levelId, (m) => {
      const s = m.states.find((n) => n.id === id);
      if (s) s.label = trimmed;
    });
  }

  deleteState(levelId: string, id: StateId): void {
    this.edit(levelId, (m) => {
      m.states = m.states.filter((s) => s.id !== id);
      m.transitions = m.transitions.filter((t) => t.from !== id && t.to !== id);
      m.accepting = m.accepting.filter((a) => a !== id);
      if (m.start === id) m.start = m.states[0]?.id ?? null;
    });
  }

  setStart(levelId: string, id: StateId): void {
    this.edit(levelId, (m) => {
      m.start = id;
    });
  }

  toggleAccepting(levelId: string, id: StateId): void {
    this.edit(levelId, (m) => {
      m.accepting = m.accepting.includes(id)
        ? m.accepting.filter((a) => a !== id)
        : [...m.accepting, id];
    });
  }

  addTransition(levelId: string, t: Omit<Transition, 'id'>): TransitionId {
    const id = nextId(this.machineFor(levelId).transitions.map((x) => x.id), 't');
    this.edit(levelId, (m) => {
      m.transitions.push({ ...t, id });
    });
    return id;
  }

  updateTransition(levelId: string, id: TransitionId, patch: Partial<Transition>): void {
    this.edit(levelId, (m) => {
      const t = m.transitions.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
  }

  deleteTransition(levelId: string, id: TransitionId): void {
    this.edit(levelId, (m) => {
      m.transitions = m.transitions.filter((t) => t.id !== id);
    });
  }

  tidy(levelId: string): void {
    this.edit(levelId, (m) => {
      const points = layoutMachine(m);
      m.states.forEach((s, i) => {
        const p = points[i];
        if (p) {
          s.x = p.x;
          s.y = p.y;
        }
      });
    });
  }

  clear(levelId: string): void {
    this.edit(levelId, (m) => Object.assign(m, emptyMachine()));
  }

  /** Show the worked solution. The level is then marked as solved by reveal. */
  reveal(levelId: string): void {
    const solution = solutionFor(levelId);
    if (!solution) return;
    if (!this.progress.shownSolution.includes(levelId)) {
      this.progress.shownSolution = [...this.progress.shownSolution, levelId];
      // This one is progress, not canvas, so it is saved. edit no longer does
      // it on this method's behalf.
      this.schedulePersist();
    }
    this.edit(levelId, (m) => Object.assign(m, cloneMachine(solution)));
  }

  replaceMachine(levelId: string, machine: Machine): void {
    this.edit(levelId, (m) => Object.assign(m, cloneMachine(machine)));
  }

  undo(levelId: string): void {
    const draft = this.drafts.get(levelId);
    if (!draft || draft.past.length === 0) return;
    const previous = draft.past[draft.past.length - 1] as Machine;
    this.drafts.set(levelId, {
      machine: previous,
      past: draft.past.slice(0, -1),
      future: [draft.machine, ...draft.future].slice(0, HISTORY_LIMIT),
    });
    this.emit();
  }

  redo(levelId: string): void {
    const draft = this.drafts.get(levelId);
    if (!draft || draft.future.length === 0) return;
    const next = draft.future[0] as Machine;
    this.drafts.set(levelId, {
      machine: next,
      past: [...draft.past, draft.machine].slice(-HISTORY_LIMIT),
      future: draft.future.slice(1),
    });
    this.emit();
  }

  markSolved(levelId: string, stateCount: number): void {
    const best = this.progress.bestStates[levelId];
    if (!this.progress.solved.includes(levelId)) {
      this.progress.solved = [...this.progress.solved, levelId];
    }
    this.progress.bestStates = {
      ...this.progress.bestStates,
      [levelId]: best === undefined ? stateCount : Math.min(best, stateCount),
    };
    this.schedulePersist();
    this.emit();
  }

  setTheme(choice: ThemeChoice): void {
    this.theme = choice;
    this.schedulePersist();
    this.emit();
  }

  resetProgress(): void {
    this.progress = { solved: [], shownSolution: [], bestStates: {} };
    this.drafts.clear();
    this.schedulePersist();
    this.emit();
  }
}

export const game = new Game();

if (typeof document !== 'undefined') {
  // A tab being hidden may be the last event before it is discarded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.flush();
  });
  window.addEventListener('pagehide', () => game.flush());
}
