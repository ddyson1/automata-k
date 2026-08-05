/**
 * The simulators. One per machine class, plus a dispatcher.
 *
 * Every simulator returns { accepted, frames, error?, note?, outcome }.
 * Frames drive the step-through player and are capped at LIMITS.frames, but
 * simulation always continues to the real limit so the verdict is honest.
 */

import { validate } from './validate';
import {
  BLANK,
  EPSILON,
  LIMITS,
  STACK_BOTTOM,
  type Frame,
  type Level,
  type Machine,
  type RunResult,
  type StateId,
  type Transition,
} from './types';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

class FrameLog {
  private readonly frames: Frame[] = [];
  private dropped = 0;

  push(f: Frame): void {
    if (this.frames.length < LIMITS.frames) this.frames.push(f);
    else this.dropped++;
  }

  get value(): Frame[] {
    return this.frames;
  }

  get truncated(): boolean {
    return this.dropped > 0;
  }
}

const outgoing = (m: Machine, s: StateId): Transition[] =>
  m.transitions.filter((t) => t.from === s);

const joinNotes = (...parts: (string | undefined)[]): string | undefined => {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(' ') : undefined;
};

const errorResult = (message: string): RunResult => ({
  accepted: false,
  frames: [],
  error: message,
  outcome: 'error',
});

// ---------------------------------------------------------------------------
// DFA
// ---------------------------------------------------------------------------

/**
 * Deterministic finite automaton.
 *
 * A missing (state, symbol) pair is allowed and behaves as an implicit dead
 * state; the count is surfaced as a note rather than an error. Duplicate reads
 * and empty moves are validation errors and are reported instead of simulated.
 */
export function simulateDFA(m: Machine, level: Level, input: string): RunResult {
  const report = validate(m, level);
  if (!report.ok) return errorResult(report.errors[0]?.message ?? 'This machine is not a DFA.');

  const partialNote = report.total
    ? undefined
    : `δ is partial: ${report.missingPairs.length} unwired ${
        report.missingPairs.length === 1 ? 'pair' : 'pairs'
      }.`;

  const log = new FrameLog();
  let current = m.start as StateId;
  log.push({ active: [current], pos: 0 });

  for (let i = 0; i < input.length; i++) {
    const symbol = input[i] as string;
    const next = m.transitions.find((t) => t.from === current && t.read === symbol);
    if (!next) {
      log.push({ active: [], pos: i + 1, label: `no arrow from here on ${symbol}` });
      return {
        accepted: false,
        frames: log.value,
        outcome: 'reject',
        note: joinNotes(`Dead: no arrow on ${symbol}.`, partialNote),
      };
    }
    current = next.to;
    log.push({ active: [current], pos: i + 1 });
  }

  return {
    accepted: m.accepting.includes(current),
    frames: log.value,
    outcome: m.accepting.includes(current) ? 'accept' : 'reject',
    note: partialNote,
  };
}

// ---------------------------------------------------------------------------
// NFA
// ---------------------------------------------------------------------------

/** Epsilon closure of a state set. */
export function epsilonClosure(m: Machine, states: Iterable<StateId>): Set<StateId> {
  const closure = new Set<StateId>(states);
  const stack: StateId[] = [...closure];
  while (stack.length) {
    const q = stack.pop() as StateId;
    for (const t of m.transitions) {
      if (t.from === q && t.read === EPSILON && !closure.has(t.to)) {
        closure.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return closure;
}

const sorted = (s: Iterable<StateId>): StateId[] => [...s].sort();

/**
 * Nondeterministic finite automaton with empty moves.
 * Epsilon closure plus subset simulation; accept when the reachable set meets F.
 */
export function simulateNFA(m: Machine, level: Level, input: string): RunResult {
  const report = validate(m, level);
  if (!report.ok) return errorResult(report.errors[0]?.message ?? 'This machine is not an NFA.');

  const log = new FrameLog();
  let active = epsilonClosure(m, [m.start as StateId]);
  log.push({ active: sorted(active), pos: 0 });

  for (let i = 0; i < input.length; i++) {
    const symbol = input[i] as string;
    const moved = new Set<StateId>();
    for (const q of active) {
      for (const t of m.transitions) {
        if (t.from === q && t.read === symbol) moved.add(t.to);
      }
    }
    active = epsilonClosure(m, moved);
    log.push({ active: sorted(active), pos: i + 1 });
    if (active.size === 0) {
      return {
        accepted: false,
        frames: log.value,
        outcome: 'reject',
        note: `Every branch died after reading ${symbol}.`,
      };
    }
  }

  const accepted = [...active].some((q) => m.accepting.includes(q));
  return {
    accepted,
    frames: log.value,
    outcome: accepted ? 'accept' : 'reject',
  };
}

// ---------------------------------------------------------------------------
// PDA
// ---------------------------------------------------------------------------

interface PdaConfig {
  state: StateId;
  stack: string[];
  pos: number;
}

const pdaKey = (c: PdaConfig): string => `${c.state}|${c.stack.join(',')}|${c.pos}`;

/**
 * Pushdown automaton.
 *
 * Stack starts as ["$"]. Each transition reads a symbol or epsilon, pops one
 * symbol or epsilon, and pushes one symbol or epsilon, the pushed symbol
 * landing on top. Acceptance is by final state with the whole input consumed.
 *
 * Simulated by breadth-first search over (state, stack, position) with a
 * visited set and a parent map for trace reconstruction.
 */
export function simulatePDA(m: Machine, level: Level, input: string): RunResult {
  const report = validate(m, level);
  if (!report.ok) return errorResult(report.errors[0]?.message ?? 'This machine is not a PDA.');

  const stackCap = LIMITS.pdaStackHeight(input.length);
  const start: PdaConfig = { state: m.start as StateId, stack: [STACK_BOTTOM], pos: 0 };

  const configs = new Map<string, PdaConfig>();
  const parent = new Map<string, string>();
  const queue: string[] = [];

  const startKey = pdaKey(start);
  configs.set(startKey, start);
  queue.push(startKey);

  let dequeued = 0;
  let head = 0;
  let cappedConfigs = false;
  let cappedStack = false;
  // Deepest configuration reached, used to build a trace when the run rejects.
  let best = startKey;
  let bestPos = 0;

  let acceptKey: string | null = null;

  while (head < queue.length) {
    if (dequeued >= LIMITS.pdaConfigs) {
      cappedConfigs = true;
      break;
    }
    const key = queue[head++] as string;
    dequeued++;
    const cfg = configs.get(key) as PdaConfig;

    if (cfg.pos > bestPos) {
      bestPos = cfg.pos;
      best = key;
    }

    if (cfg.pos === input.length && m.accepting.includes(cfg.state)) {
      acceptKey = key;
      break;
    }

    for (const t of outgoing(m, cfg.state)) {
      let pos = cfg.pos;
      if (t.read !== EPSILON) {
        if (cfg.pos >= input.length || input[cfg.pos] !== t.read) continue;
        pos = cfg.pos + 1;
      }
      const stack = cfg.stack.slice();
      const pop = t.pop ?? EPSILON;
      if (pop !== EPSILON) {
        if (stack.length === 0 || stack[stack.length - 1] !== pop) continue;
        stack.pop();
      }
      const push = t.push ?? EPSILON;
      if (push !== EPSILON) stack.push(push);

      if (stack.length > stackCap) {
        cappedStack = true;
        continue;
      }

      const next: PdaConfig = { state: t.to, stack, pos };
      const nextKey = pdaKey(next);
      if (configs.has(nextKey)) continue;
      configs.set(nextKey, next);
      parent.set(nextKey, key);
      queue.push(nextKey);
    }
  }

  const path: PdaConfig[] = [];
  let cursor: string | null = acceptKey ?? best;
  while (cursor) {
    path.unshift(configs.get(cursor) as PdaConfig);
    cursor = parent.get(cursor) ?? null;
  }

  const log = new FrameLog();
  for (const c of path) {
    log.push({ active: [c.state], pos: c.pos, stack: c.stack.slice() });
  }

  if (acceptKey !== null) {
    return { accepted: true, frames: log.value, outcome: 'accept' };
  }

  if (cappedConfigs) {
    return {
      accepted: false,
      frames: log.value,
      outcome: 'nonhalting',
      note: `Gave up after ${LIMITS.pdaConfigs.toLocaleString('en-US')} configurations. The search did not finish, so this is not a rejection.`,
    };
  }

  return {
    accepted: false,
    frames: log.value,
    outcome: 'reject',
    note: joinNotes(
      cappedStack ? `Some branches passed the stack height cap of ${stackCap}.` : undefined,
    ),
  };
}

// ---------------------------------------------------------------------------
// TM
// ---------------------------------------------------------------------------

interface TapeWindow {
  cells: string[];
  head: number;
  offset: number;
}

function materialise(tape: Map<number, string>, headIdx: number, inputLength: number): TapeWindow {
  let lo = Math.min(0, headIdx);
  let hi = Math.max(inputLength - 1, headIdx);
  for (const idx of tape.keys()) {
    if (idx < lo) lo = idx;
    if (idx > hi) hi = idx;
  }
  lo -= 1;
  hi += 1;
  const cells: string[] = [];
  for (let i = lo; i <= hi; i++) cells.push(tape.get(i) ?? BLANK);
  return { cells, head: headIdx - lo, offset: lo };
}

/**
 * Single tape Turing machine, tape infinite in both directions, blank filled.
 *
 * Delta is partial: no applicable transition halts and rejects. The machine
 * accepts the moment it enters an accepting state. Hitting the step limit is
 * reported as a non-halting run, distinct from a rejection.
 */
export function simulateTM(m: Machine, level: Level, input: string): RunResult {
  const report = validate(m, level);
  if (!report.ok) return errorResult(report.errors[0]?.message ?? 'This machine is not a TM.');

  const tape = new Map<number, string>();
  for (let i = 0; i < input.length; i++) tape.set(i, input[i] as string);

  let state = m.start as StateId;
  let head = 0;
  const log = new FrameLog();

  const frame = (label?: string): Frame => {
    const w = materialise(tape, head, input.length);
    return {
      active: [state],
      pos: Math.max(0, Math.min(head, input.length)),
      tape: w.cells,
      head: w.head,
      tapeOffset: w.offset,
      ...(label ? { label } : {}),
    };
  };

  log.push(frame());

  if (m.accepting.includes(state)) {
    return { accepted: true, frames: log.value, outcome: 'accept' };
  }

  for (let step = 0; step < LIMITS.tmSteps; step++) {
    const read = tape.get(head) ?? BLANK;
    const rule = m.transitions.find((t) => t.from === state && t.read === read);
    if (!rule) {
      log.push(frame(`no rule for ${read}`));
      return {
        accepted: false,
        frames: log.value,
        outcome: 'reject',
        note: `Halted: no rule from this state reading ${read}.`,
      };
    }
    tape.set(head, rule.write ?? read);
    head += rule.move === 'L' ? -1 : 1;
    state = rule.to;
    log.push(frame());

    if (m.accepting.includes(state)) {
      return { accepted: true, frames: log.value, outcome: 'accept' };
    }
  }

  return {
    accepted: false,
    frames: log.value,
    outcome: 'nonhalting',
    note: `Still running after ${LIMITS.tmSteps.toLocaleString('en-US')} steps. That is not a rejection, the machine simply has not halted.`,
  };
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

export function run(m: Machine, level: Level, input: string): RunResult {
  switch (level.type) {
    case 'DFA':
      return simulateDFA(m, level, input);
    case 'NFA':
      return simulateNFA(m, level, input);
    case 'PDA':
      return simulatePDA(m, level, input);
    case 'TM':
      return simulateTM(m, level, input);
  }
}

/**
 * The shortest string on which a machine disagrees with the level's language.
 *
 * Shown when a test fails, so the player gets the actual distinguishing string
 * rather than only the failing row. Searches shortest first and returns null if
 * the machine agrees everywhere up to `maxLength`.
 */
export function shortestCounterexample(
  m: Machine,
  level: Level,
  maxLength = 7,
): { input: string; expected: boolean; actual: boolean } | null {
  let frontier: string[] = [''];
  for (let len = 0; len <= maxLength; len++) {
    for (const w of frontier) {
      const result = run(m, level, w);
      if (result.error) return null;
      const expected = level.accepts(w);
      if (result.accepted !== expected) {
        return { input: w, expected, actual: result.accepted };
      }
    }
    const next: string[] = [];
    for (const w of frontier) for (const a of level.alphabet) next.push(w + a);
    frontier = next;
    if (frontier.length > 60_000) break;
  }
  return null;
}

export interface TestRow {
  input: string;
  expected: boolean;
  actual: boolean;
  pass: boolean;
  result: RunResult;
}

export interface SuiteResult {
  rows: TestRow[];
  passed: number;
  total: number;
  solved: boolean;
  /** First blocking error, if the machine is not well formed. */
  error?: string;
}

/**
 * Grade a machine against a level's fixed test suite.
 * Expected results always come from level.accepts, never from stored answers.
 */
export function runSuite(m: Machine, level: Level): SuiteResult {
  const rows: TestRow[] = level.tests.map((input) => {
    const result = run(m, level, input);
    const expected = level.accepts(input);
    const actual = result.accepted;
    return { input, expected, actual, pass: expected === actual && !result.error, result };
  });
  const passed = rows.filter((r) => r.pass).length;
  const firstError = rows.find((r) => r.result.error)?.result.error;
  return {
    rows,
    passed,
    total: rows.length,
    solved: passed === rows.length && rows.length > 0,
    ...(firstError ? { error: firstError } : {}),
  };
}
