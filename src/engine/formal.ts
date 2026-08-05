/**
 * The formal layer: the same machine the player drew, written as a tuple and a
 * transition function.
 *
 * Everything here is plain Unicode text. No LaTeX engine, no markup. Each δ
 * line carries the transition ids it came from, which is what makes the
 * highlighting bidirectional: selecting an arrow lights up its lines, and
 * tapping a line selects and centres its arrow.
 */

import { findMissingPairs } from './validate';
import {
  BLANK,
  EPSILON,
  STACK_BOTTOM,
  type ChomskyType,
  type Grammar,
  type Level,
  type Machine,
  type MachineKind,
  type StateId,
  type TransitionId,
} from './types';

const SUB0 = '₀';

export interface TupleLine {
  /** The component symbol, e.g. "Q" or "q₀". */
  symbol: string;
  /** What it is, in words. */
  gloss: string;
  value: string;
}

export interface DeltaLine {
  /** The rendered line, e.g. "δ(q0, 0) = q1". */
  text: string;
  /** Arrows this line came from. Empty for a gap. */
  transitionIds: TransitionId[];
  /** True when δ is undefined here. Rendered in red. */
  missing: boolean;
  /** Source state, used to centre the canvas when the line is tapped. */
  from: StateId;
  symbol: string;
}

const setOf = (items: readonly string[]): string =>
  items.length === 0 ? '∅' : `{${items.join(', ')}}`;

const labels = (m: Machine): Map<StateId, string> =>
  new Map(m.states.map((s) => [s.id, s.label]));

const labelOf = (m: Machine, id: StateId): string =>
  m.states.find((s) => s.id === id)?.label ?? '?';

/** The machine as its defining tuple. */
export function machineTuple(m: Machine, level: Level): TupleLine[] {
  const l = labels(m);
  const stateNames = m.states.map((s) => s.label);
  const lines: TupleLine[] = [
    { symbol: 'Q', gloss: 'states', value: setOf(stateNames) },
    { symbol: 'Σ', gloss: 'input alphabet', value: setOf(level.alphabet) },
  ];

  if (level.type === 'PDA') {
    lines.push({
      symbol: 'Γ',
      gloss: 'stack alphabet',
      value: setOf(level.stackAlphabet ?? [STACK_BOTTOM]),
    });
  }
  if (level.type === 'TM') {
    lines.push({
      symbol: 'Γ',
      gloss: 'tape alphabet',
      value: setOf(level.tapeAlphabet ?? [...level.alphabet, BLANK]),
    });
  }

  lines.push({
    symbol: `q${SUB0}`,
    gloss: 'start state',
    value: m.start === null ? 'undefined' : (l.get(m.start) ?? '?'),
  });

  if (level.type === 'PDA') {
    lines.push({ symbol: `Z${SUB0}`, gloss: 'bottom of stack', value: STACK_BOTTOM });
  }
  if (level.type === 'TM') {
    lines.push({ symbol: '␣', gloss: 'blank symbol', value: BLANK });
  }

  lines.push({
    symbol: 'F',
    gloss: 'accepting states',
    value: setOf(m.accepting.map((id) => l.get(id) ?? '?').sort()),
  });

  return lines;
}

/** The signature of δ for a machine class, e.g. "δ : Q × Σ → Q". */
export function deltaSignature(kind: MachineKind): string {
  switch (kind) {
    case 'DFA':
      return 'δ : Q × Σ → Q';
    case 'NFA':
      return 'δ : Q × (Σ ∪ {ε}) → P(Q)';
    case 'PDA':
      return 'δ : Q × (Σ ∪ {ε}) × (Γ ∪ {ε}) → P(Q × (Γ ∪ {ε}))';
    case 'TM':
      return 'δ : Q × Γ ⇀ Q × Γ × {L, R}';
  }
}

/**
 * Every line of δ, in the notation for the machine class.
 *
 *   DFA  δ(q0, 0) = q1          gaps as δ(q0, 1) = undefined
 *   NFA  δ(q0, a) = {q1, q2}
 *   PDA  δ(q0, a, X) ∋ (q1, Y)
 *   TM   δ(q0, a) = (q1, X, R)
 */
export function deltaLines(m: Machine, level: Level): DeltaLine[] {
  const lines: DeltaLine[] = [];
  const name = (id: StateId): string => labelOf(m, id);

  if (level.type === 'DFA') {
    const seen = new Set<string>();
    for (const s of m.states) {
      for (const a of level.alphabet) {
        const arrows = m.transitions.filter((t) => t.from === s.id && t.read === a);
        seen.add(`${s.id} ${a}`);
        if (arrows.length === 0) {
          lines.push({
            text: `δ(${s.label}, ${a}) = undefined`,
            transitionIds: [],
            missing: true,
            from: s.id,
            symbol: a,
          });
        } else {
          lines.push({
            text: `δ(${s.label}, ${a}) = ${arrows.map((t) => name(t.to)).join(' | ')}`,
            transitionIds: arrows.map((t) => t.id),
            missing: false,
            from: s.id,
            symbol: a,
          });
        }
      }
    }
    // Arrows on symbols outside Sigma still deserve a line, or they vanish.
    for (const t of m.transitions) {
      if (!seen.has(`${t.from} ${t.read}`)) {
        lines.push({
          text: `δ(${name(t.from)}, ${t.read}) = ${name(t.to)}`,
          transitionIds: [t.id],
          missing: false,
          from: t.from,
          symbol: t.read,
        });
      }
    }
    return lines;
  }

  if (level.type === 'NFA') {
    const symbols = [...level.alphabet, EPSILON];
    for (const s of m.states) {
      for (const a of symbols) {
        const arrows = m.transitions.filter((t) => t.from === s.id && t.read === a);
        if (arrows.length === 0) continue;
        lines.push({
          text: `δ(${s.label}, ${a}) = ${setOf(arrows.map((t) => name(t.to)).sort())}`,
          transitionIds: arrows.map((t) => t.id),
          missing: false,
          from: s.id,
          symbol: a,
        });
      }
    }
    return lines;
  }

  if (level.type === 'PDA') {
    for (const t of m.transitions) {
      const pop = t.pop ?? EPSILON;
      const push = t.push ?? EPSILON;
      lines.push({
        text: `δ(${name(t.from)}, ${t.read}, ${pop}) ∋ (${name(t.to)}, ${push})`,
        transitionIds: [t.id],
        missing: false,
        from: t.from,
        symbol: t.read,
      });
    }
    return lines;
  }

  for (const t of m.transitions) {
    lines.push({
      text: `δ(${name(t.from)}, ${t.read}) = (${name(t.to)}, ${t.write ?? t.read}, ${t.move ?? 'R'})`,
      transitionIds: [t.id],
      missing: false,
      from: t.from,
      symbol: t.read,
    });
  }
  return lines;
}

export interface DeltaSummary {
  lines: DeltaLine[];
  signature: string;
  /** DFA only: is δ defined on every pair. */
  total: boolean;
  /** Running note under the δ list. */
  note: string;
}

export function deltaSummary(m: Machine, level: Level): DeltaSummary {
  const lines = deltaLines(m, level);
  const gaps = findMissingPairs(m, level.type, level.alphabet);
  const pairs = m.states.length * level.alphabet.length;

  let note: string;
  if (level.type === 'DFA') {
    note =
      gaps.length === 0
        ? `δ is total: all ${pairs} ${pairs === 1 ? 'pair' : 'pairs'} defined.`
        : `δ is partial: ${pairs - gaps.length} of ${pairs} pairs defined, ${gaps.length} undefined.`;
  } else if (level.type === 'TM') {
    note = `δ is partial by design. ${lines.length} ${lines.length === 1 ? 'rule' : 'rules'} defined; anything undefined halts and rejects.`;
  } else {
    note = `${lines.length} ${lines.length === 1 ? 'rule' : 'rules'}. A partial δ is not a gap for this class.`;
  }

  return {
    lines,
    signature: deltaSignature(level.type),
    total: level.type === 'DFA' ? gaps.length === 0 : true,
    note,
  };
}

// ---------------------------------------------------------------------------
// grammars
// ---------------------------------------------------------------------------

/** Group a grammar's productions by left-hand side and render them with | between alternatives. */
export function grammarLines(gr: Grammar): string[] {
  const order: string[] = [];
  const groups = new Map<string, string[]>();
  for (const p of gr.productions) {
    const list = groups.get(p.lhs);
    if (list) list.push(p.rhs === '' ? EPSILON : p.rhs);
    else {
      order.push(p.lhs);
      groups.set(p.lhs, [p.rhs === '' ? EPSILON : p.rhs]);
    }
  }
  return order.map((lhs) => `${lhs} → ${(groups.get(lhs) ?? []).join(' | ')}`);
}

export const grammarTuple = (gr: Grammar): TupleLine[] => [
  { symbol: 'V', gloss: 'non terminals', value: setOf(gr.nonTerminals) },
  { symbol: 'T', gloss: 'terminals', value: setOf(gr.terminals) },
  { symbol: 'S', gloss: 'start symbol', value: gr.start },
];

// ---------------------------------------------------------------------------
// hierarchy and machine class copy
// ---------------------------------------------------------------------------

export interface ClassCopy {
  kind: MachineKind;
  name: string;
  /** The defining tuple, as text. */
  definition: string;
  /** When the machine accepts. */
  acceptance: string;
  /** What the class can and cannot do. */
  power: string;
}

export const MACHINE_CLASS: Record<MachineKind, ClassCopy> = {
  DFA: {
    kind: 'DFA',
    name: 'Deterministic finite automaton',
    definition: `M = (Q, Σ, δ, q${SUB0}, F) with ${deltaSignature('DFA')}`,
    acceptance: `M accepts w when δ̂(q${SUB0}, w) ∈ F, where δ̂ extends δ to strings.`,
    power:
      'Exactly the regular languages. One state per fact worth remembering, and no way to remember more than finitely many facts.',
  },
  NFA: {
    kind: 'NFA',
    name: 'Nondeterministic finite automaton',
    definition: `M = (Q, Σ, δ, q${SUB0}, F) with ${deltaSignature('NFA')}`,
    acceptance: `M accepts w when δ̂(q${SUB0}, w) ∩ F ≠ ∅: at least one branch survives and ends in F.`,
    power:
      'Also exactly the regular languages. The subset construction turns any NFA of n states into a DFA of at most 2ⁿ, so nondeterminism buys size, never power.',
  },
  PDA: {
    kind: 'PDA',
    name: 'Pushdown automaton',
    definition: `M = (Q, Σ, Γ, δ, q${SUB0}, Z${SUB0}, F) with ${deltaSignature('PDA')}`,
    acceptance: `M accepts w by final state: (q${SUB0}, w, Z${SUB0}) ⊢* (q, ε, γ) for some q ∈ F and any stack γ.`,
    power:
      'Exactly the context free languages. One unbounded stack, last in first out, which is enough to match nested pairs but not two independent counts.',
  },
  TM: {
    kind: 'TM',
    name: 'Turing machine',
    definition: `M = (Q, Σ, Γ, δ, q${SUB0}, ␣, F) with ${deltaSignature('TM')}`,
    acceptance:
      'M accepts w when the run from q₀ on w enters a state of F. It may reject by halting with no applicable rule, or never halt at all.',
    power:
      'The recursively enumerable languages. Reading and writing anywhere on the tape removes every restriction the earlier classes had.',
  },
};

export interface HierarchyRow {
  type: ChomskyType;
  name: string;
  /** The shape of the grammar productions allowed. */
  productions: string;
  machine: string;
  example: string;
}

export const HIERARCHY: HierarchyRow[] = [
  {
    type: 3,
    name: 'Regular',
    productions: 'A → aB, A → a, A → ε',
    machine: 'Finite automaton',
    example: 'a*b*',
  },
  {
    type: 2,
    name: 'Context free',
    productions: 'A → γ, with γ any string of symbols',
    machine: 'Pushdown automaton',
    example: 'aⁿbⁿ',
  },
  {
    type: 1,
    name: 'Context sensitive',
    productions: 'αAβ → αγβ, with |γ| ≥ 1',
    machine: 'Linear bounded automaton',
    example: 'aⁿbⁿcⁿ',
  },
  {
    type: 0,
    name: 'Recursively enumerable',
    productions: 'α → β, with α containing a non terminal',
    machine: 'Turing machine',
    example: 'the set of machines that halt on their own description',
  },
];

export const hierarchyRow = (type: ChomskyType): HierarchyRow =>
  HIERARCHY.find((h) => h.type === type) as HierarchyRow;

/** One-line placement of a level in the hierarchy, for the level sheet. */
export const hierarchyBlurb = (level: Level): string => {
  const row = hierarchyRow(level.chomsky);
  return `Type ${row.type}, ${row.name.toLowerCase()}. Recognised by a ${row.machine.toLowerCase()}.`;
};
