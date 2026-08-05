/**
 * Core engine types.
 *
 * This module (and everything else under src/engine) is pure TypeScript with
 * zero React and zero React Native imports, so the whole engine is importable
 * from a plain Node script. The verification suites in /tests depend on that.
 */

/** Epsilon. A distinct symbol constant. Never a member of an input alphabet. */
export const EPSILON = 'ε';

/** The blank tape symbol. A distinct tape symbol, never an input symbol. */
export const BLANK = '␣';

/** Bottom-of-stack marker a PDA stack is initialised with. */
export const STACK_BOTTOM = '$';

export type MachineKind = 'DFA' | 'NFA' | 'PDA' | 'TM';

export type StateId = string;
export type TransitionId = string;

/** Head movement for a Turing machine. */
export type Move = 'L' | 'R';

export interface AutomatonState {
  id: StateId;
  /** Player-visible label, e.g. "q0". Renameable. */
  label: string;
  /** Logical canvas coordinates. See CANVAS below. */
  x: number;
  y: number;
}

/**
 * A single arrow-borne rule. One diagram edge (from -> to) may carry several
 * transitions; the renderer stacks them as separate chips.
 *
 * Field use by machine class:
 *   DFA  read
 *   NFA  read (may be EPSILON)
 *   PDA  read, pop, push (each may be EPSILON)
 *   TM   read, write, move
 */
export interface Transition {
  id: TransitionId;
  from: StateId;
  to: StateId;
  read: string;
  pop?: string;
  push?: string;
  write?: string;
  move?: Move;
}

export interface Machine {
  states: AutomatonState[];
  transitions: Transition[];
  start: StateId | null;
  accepting: StateId[];
}

/** One step of a run, used to drive the trace player. */
export interface Frame {
  /** Active state set. Single-element for DFA/TM, a set for NFA, a path node for PDA. */
  active: StateId[];
  /** Read head position within the input string. */
  pos: number;
  /** PDA only. Bottom-first, so the last element is the top of the stack. */
  stack?: string[];
  /** TM only. A materialised window of the tape. */
  tape?: string[];
  /** TM only. Index of the head within `tape`. */
  head?: number;
  /** TM only. Tape cell index that `tape[0]` corresponds to. */
  tapeOffset?: number;
  /** Optional human note for this step, shown in the trace player. */
  label?: string;
}

export type RunOutcome = 'accept' | 'reject' | 'error' | 'nonhalting';

export interface RunResult {
  accepted: boolean;
  frames: Frame[];
  /** Set when the machine is not well formed and was therefore not simulated. */
  error?: string;
  /** Informational: partial delta counts, caps hit, and so on. */
  note?: string;
  /** Distinguishes a rejection from a run that hit a cap without halting. */
  outcome: RunOutcome;
}

/** A production of a phrase-structure grammar. Symbols are single characters. */
export interface Production {
  lhs: string;
  /** Right-hand side. The empty string denotes epsilon. */
  rhs: string;
}

export interface Grammar {
  nonTerminals: string[];
  terminals: string[];
  start: string;
  productions: Production[];
  /** Rendered production lines, e.g. "S -> aSb | ε". Derived, but cached for display. */
  note?: string;
}

/** Chomsky hierarchy type number. 3 regular, 2 context free, 1 context sensitive, 0 recursively enumerable. */
export type ChomskyType = 0 | 1 | 2 | 3;

export interface Level {
  id: string;
  /** 1-based position in the campaign. Levels unlock in this order. */
  index: number;
  type: MachineKind;
  title: string;
  /** One-line player-facing goal. */
  goal: string;
  alphabet: string[];
  /** PDA only. Excludes EPSILON, includes STACK_BOTTOM. */
  stackAlphabet?: string[];
  /** TM only. Excludes EPSILON, includes BLANK. */
  tapeAlphabet?: string[];
  /** State count of the verified solution. */
  par: number;
  /** The fixed test suite the grader runs. */
  tests: string[];
  /** Single source of truth for expected results. Never hardcode pass/fail per string. */
  accepts: (w: string) => boolean;
  /** Short theory note shown in the level sheet. */
  theory: string;
  hint: string;
  /** The language in set-builder form, for the formal layer. */
  setBuilder: string;
  /** A grammar that generates the language. Verified by derivation in tests/grammar.test.ts. */
  grammar: Grammar;
  chomsky: ChomskyType;
  /**
   * Exhaustive verification depth: every string over `alphabet` up to this
   * length is checked against `accepts`. 6 for most levels, 9 for a^n b^n c^n.
   */
  exhaustiveMaxLength: number;
}

/**
 * Logical canvas. The UI maps this box onto the fixed card and applies zoom and
 * pan on top, so authored coordinates are resolution independent.
 */
export const CANVAS = {
  width: 340,
  height: 460,
  /** Drawn radius of a state. */
  stateRadius: 28,
  /** Hit radius of a state, larger than the drawn radius for touch. */
  hitRadius: 36,
  /** Minimum gap between a state's rim and the canvas edge. */
  padding: 10,
} as const;

/** Simulation caps. Ported verbatim; the tests depend on these exact numbers. */
export const LIMITS = {
  /** PDA: maximum configurations dequeued before giving up. */
  pdaConfigs: 40_000,
  /** PDA: stack height cap, as a function of input length. */
  pdaStackHeight: (inputLength: number): number => 2 * inputLength + 12,
  /** TM: maximum steps before reporting a non-halting result. */
  tmSteps: 4_000,
  /** Frames retained for the trace player. Simulation continues past this. */
  frames: 400,
} as const;

export const isEpsilon = (s: string | undefined): boolean => s === EPSILON;
