/**
 * Game state: the machine on the canvas per level, undo and redo, and progress.
 *
 * Positions committed here are the authoritative ones. During a drag the canvas
 * writes to a Reanimated shared value instead and calls moveState once, on
 * release. Nothing in this store runs per frame.
 */

import { create } from 'zustand';

import { LEVELS, isUnlocked } from '../engine/levels';
import { ringLayout } from '../engine/minimize';
import { solutionFor } from '../engine/solutions';
import type { Level, Machine, Move, StateId, Transition, TransitionId } from '../engine/types';
import { readJson, writeJson } from './storage';

const PROGRESS_KEY = 'automata-lab.progress.v1';
const DRAFTS_KEY = 'automata-lab.drafts.v1';
const HISTORY_LIMIT = 60;

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

const nextId = (existing: string[], prefix: string): string => {
  let n = 0;
  const taken = new Set(existing);
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export interface GameState {
  hydrated: boolean;
  progress: Progress;
  drafts: Record<string, Draft>;

  hydrate: () => Promise<void>;
  machineFor: (levelId: string) => Machine;
  canUndo: (levelId: string) => boolean;
  canRedo: (levelId: string) => boolean;

  addState: (levelId: string, x: number, y: number) => StateId;
  moveState: (levelId: string, id: StateId, x: number, y: number) => void;
  renameState: (levelId: string, id: StateId, label: string) => void;
  deleteState: (levelId: string, id: StateId) => void;
  setStart: (levelId: string, id: StateId) => void;
  toggleAccepting: (levelId: string, id: StateId) => void;

  addTransition: (levelId: string, t: Omit<Transition, 'id'>) => TransitionId;
  updateTransition: (levelId: string, id: TransitionId, patch: Partial<Transition>) => void;
  deleteTransition: (levelId: string, id: TransitionId) => void;

  tidy: (levelId: string) => void;
  clear: (levelId: string) => void;
  reveal: (levelId: string) => void;
  replaceMachine: (levelId: string, machine: Machine) => void;
  undo: (levelId: string) => void;
  redo: (levelId: string) => void;

  markSolved: (levelId: string, stateCount: number) => void;
  resetProgress: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => GameState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { progress, drafts } = get();
    const machines: Record<string, Machine> = {};
    for (const [id, draft] of Object.entries(drafts)) {
      if (draft.machine.states.length > 0) machines[id] = draft.machine;
    }
    void writeJson(PROGRESS_KEY, progress);
    void writeJson(DRAFTS_KEY, machines);
  }, 250);
}

/** Flush pending writes immediately. Used before the app backgrounds. */
export async function flushPersist(state: GameState): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const machines: Record<string, Machine> = {};
  for (const [id, draft] of Object.entries(state.drafts)) {
    if (draft.machine.states.length > 0) machines[id] = draft.machine;
  }
  await writeJson(PROGRESS_KEY, state.progress);
  await writeJson(DRAFTS_KEY, machines);
}

export const useGame = create<GameState>()((set, get) => {
  /** Apply an edit, pushing the previous machine onto the undo stack. */
  const edit = (levelId: string, fn: (m: Machine) => void): void => {
    set((state) => {
      const draft = state.drafts[levelId] ?? emptyDraft();
      const before = cloneMachine(draft.machine);
      const after = cloneMachine(draft.machine);
      fn(after);
      return {
        drafts: {
          ...state.drafts,
          [levelId]: {
            machine: after,
            past: [...draft.past, before].slice(-HISTORY_LIMIT),
            future: [],
          },
        },
      };
    });
    schedulePersist(get);
  };

  return {
    hydrated: false,
    progress: { solved: [], shownSolution: [], bestStates: {} },
    drafts: {},

    hydrate: async () => {
      const [progress, machines] = await Promise.all([
        readJson<Progress>(PROGRESS_KEY, { solved: [], shownSolution: [], bestStates: {} }),
        readJson<Record<string, Machine>>(DRAFTS_KEY, {}),
      ]);
      const drafts: Record<string, Draft> = {};
      for (const [id, machine] of Object.entries(machines)) {
        drafts[id] = { machine, past: [], future: [] };
      }
      set({
        hydrated: true,
        progress: {
          solved: progress.solved ?? [],
          shownSolution: progress.shownSolution ?? [],
          bestStates: progress.bestStates ?? {},
        },
        drafts,
      });
    },

    machineFor: (levelId) => get().drafts[levelId]?.machine ?? emptyMachine(),
    canUndo: (levelId) => (get().drafts[levelId]?.past.length ?? 0) > 0,
    canRedo: (levelId) => (get().drafts[levelId]?.future.length ?? 0) > 0,

    addState: (levelId, x, y) => {
      const existing = get().machineFor(levelId);
      const id = nextId(
        existing.states.map((s) => s.id),
        's',
      );
      const label = nextId(
        existing.states.map((s) => s.label),
        'q',
      );
      edit(levelId, (m) => {
        m.states.push({ id, label, x, y });
        if (m.start === null) m.start = id;
      });
      return id;
    },

    moveState: (levelId, id, x, y) => {
      edit(levelId, (m) => {
        const s = m.states.find((n) => n.id === id);
        if (s) {
          s.x = x;
          s.y = y;
        }
      });
    },

    renameState: (levelId, id, label) => {
      const trimmed = label.trim().slice(0, 6);
      if (trimmed.length === 0) return;
      edit(levelId, (m) => {
        const s = m.states.find((n) => n.id === id);
        if (s) s.label = trimmed;
      });
    },

    deleteState: (levelId, id) => {
      edit(levelId, (m) => {
        m.states = m.states.filter((s) => s.id !== id);
        m.transitions = m.transitions.filter((t) => t.from !== id && t.to !== id);
        m.accepting = m.accepting.filter((a) => a !== id);
        if (m.start === id) m.start = m.states[0]?.id ?? null;
      });
    },

    setStart: (levelId, id) => edit(levelId, (m) => void (m.start = id)),

    toggleAccepting: (levelId, id) =>
      edit(levelId, (m) => {
        m.accepting = m.accepting.includes(id)
          ? m.accepting.filter((a) => a !== id)
          : [...m.accepting, id];
      }),

    addTransition: (levelId, t) => {
      const existing = get().machineFor(levelId);
      const id = nextId(
        existing.transitions.map((x) => x.id),
        't',
      );
      edit(levelId, (m) => {
        m.transitions.push({ ...t, id });
      });
      return id;
    },

    updateTransition: (levelId, id, patch) =>
      edit(levelId, (m) => {
        const t = m.transitions.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }),

    deleteTransition: (levelId, id) =>
      edit(levelId, (m) => {
        m.transitions = m.transitions.filter((t) => t.id !== id);
      }),

    tidy: (levelId) =>
      edit(levelId, (m) => {
        const points = ringLayout(m.states.length);
        m.states.forEach((s, i) => {
          const p = points[i];
          if (p) {
            s.x = p.x;
            s.y = p.y;
          }
        });
      }),

    clear: (levelId) => edit(levelId, (m) => Object.assign(m, emptyMachine())),

    reveal: (levelId) => {
      const solution = solutionFor(levelId);
      if (!solution) return;
      edit(levelId, (m) => Object.assign(m, solution));
      set((state) => ({
        progress: {
          ...state.progress,
          shownSolution: state.progress.shownSolution.includes(levelId)
            ? state.progress.shownSolution
            : [...state.progress.shownSolution, levelId],
        },
      }));
      schedulePersist(get);
    },

    replaceMachine: (levelId, machine) =>
      edit(levelId, (m) => Object.assign(m, cloneMachine(machine))),

    undo: (levelId) => {
      set((state) => {
        const draft = state.drafts[levelId];
        if (!draft || draft.past.length === 0) return state;
        const previous = draft.past[draft.past.length - 1] as Machine;
        return {
          drafts: {
            ...state.drafts,
            [levelId]: {
              machine: previous,
              past: draft.past.slice(0, -1),
              future: [draft.machine, ...draft.future].slice(0, HISTORY_LIMIT),
            },
          },
        };
      });
      schedulePersist(get);
    },

    redo: (levelId) => {
      set((state) => {
        const draft = state.drafts[levelId];
        if (!draft || draft.future.length === 0) return state;
        const next = draft.future[0] as Machine;
        return {
          drafts: {
            ...state.drafts,
            [levelId]: {
              machine: next,
              past: [...draft.past, draft.machine].slice(-HISTORY_LIMIT),
              future: draft.future.slice(1),
            },
          },
        };
      });
      schedulePersist(get);
    },

    markSolved: (levelId, stateCount) => {
      set((state) => {
        const best = state.progress.bestStates[levelId];
        return {
          progress: {
            ...state.progress,
            solved: state.progress.solved.includes(levelId)
              ? state.progress.solved
              : [...state.progress.solved, levelId],
            bestStates: {
              ...state.progress.bestStates,
              [levelId]: best === undefined ? stateCount : Math.min(best, stateCount),
            },
          },
        };
      });
      schedulePersist(get);
    },

    resetProgress: () => {
      set({ progress: { solved: [], shownSolution: [], bestStates: {} }, drafts: {} });
      schedulePersist(get);
    },
  };
});

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

export const selectMachine = (levelId: string) => (s: GameState) =>
  s.drafts[levelId]?.machine ?? emptyMachine();

export const selectUnlockedLevels = (s: GameState): Level[] =>
  LEVELS.filter((l) => isUnlocked(l, s.progress.solved));

export const selectNextLevel = (levelId: string) => (s: GameState): Level | undefined => {
  const current = LEVELS.find((l) => l.id === levelId);
  if (!current) return undefined;
  return LEVELS.find((l) => l.index === current.index + 1);
};

export const isSolved = (s: GameState, levelId: string): boolean =>
  s.progress.solved.includes(levelId);

export const wasShown = (s: GameState, levelId: string): boolean =>
  s.progress.shownSolution.includes(levelId);

/** Move helper shared by the transition editor. */
export const MOVES: Move[] = ['L', 'R'];
