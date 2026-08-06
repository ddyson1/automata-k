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
  type Transition,
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
    lines.push({ symbol: '⊔', gloss: 'blank symbol', value: BLANK });
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
      return 'δ : Q × Γ → Q × Γ × {L, R}';
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

/**
 * The label on an arrow, one chip per transition.
 *
 *   DFA, NFA  a
 *   PDA       a, X → Y
 *   TM        a → X, R
 */
export function transitionChip(t: Transition, kind: MachineKind): string {
  switch (kind) {
    case 'DFA':
    case 'NFA':
      return t.read;
    case 'PDA':
      return `${t.read}, ${t.pop ?? EPSILON} → ${t.push ?? EPSILON}`;
    case 'TM':
      return `${t.read} → ${t.write ?? t.read}, ${t.move ?? 'R'}`;
  }
}

/** The same rule, spelled out for a screen reader. */
export function transitionSpeech(t: Transition, kind: MachineKind, m: Machine): string {
  const from = labelOf(m, t.from);
  const to = labelOf(m, t.to);
  const read = t.read === EPSILON ? 'empty move' : `reading ${t.read}`;
  switch (kind) {
    case 'DFA':
    case 'NFA':
      return `From ${from} to ${to}, ${read}.`;
    case 'PDA': {
      const pop = t.pop ?? EPSILON;
      const push = t.push ?? EPSILON;
      const popPart = pop === EPSILON ? 'popping nothing' : `popping ${pop}`;
      const pushPart = push === EPSILON ? 'pushing nothing' : `pushing ${push}`;
      return `From ${from} to ${to}, ${read}, ${popPart}, ${pushPart}.`;
    }
    case 'TM':
      return `From ${from} to ${to}, ${read}, writing ${t.write ?? t.read}, moving ${
        t.move === 'L' ? 'left' : 'right'
      }.`;
  }
}

/** A text alternative to the whole diagram, driven by the δ list. Section 10.8. */
export function machineSpeech(m: Machine, level: Level): string {
  if (m.states.length === 0) return 'The canvas is empty.';
  const startLabel = m.start === null ? 'none' : labelOf(m, m.start);
  const parts = [
    `${m.states.length} ${m.states.length === 1 ? 'state' : 'states'}: ${m.states
      .map((s) => s.label)
      .join(', ')}.`,
    `Start state ${startLabel}.`,
    m.accepting.length === 0
      ? 'No accepting states.'
      : `Accepting: ${m.accepting.map((id) => labelOf(m, id)).join(', ')}.`,
    `${m.transitions.length} ${m.transitions.length === 1 ? 'arrow' : 'arrows'}.`,
    ...m.transitions.map((t) => transitionSpeech(t, level.type, m)),
  ];
  return parts.join(' ');
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
  if (m.states.length === 0) {
    // "δ is total: all 0 pairs defined" is true and useless. An empty canvas
    // has not gone wrong, it has not started.
    note = 'Nothing drawn yet. δ has no domain to be defined on.';
  } else if (level.type === 'DFA') {
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
      'Also exactly the regular languages. The subset construction turns any NFA of n states into a DFA of at most 2^n, so nondeterminism buys size, never power.',
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
    definition: `M = (Q, Σ, Γ, δ, q${SUB0}, ⊔, F) with ${deltaSignature('TM')}`,
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
    example: 'a^nb^n',
  },
  {
    type: 1,
    name: 'Context sensitive',
    productions: 'αAβ → αγβ, with |γ| ≥ 1',
    machine: 'Linear bounded automaton',
    example: 'a^nb^nc^n',
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

// ---------------------------------------------------------------------------
// the tutorial layer
//
// A tuple is five or seven letters and a student is expected to already know
// what each one is for. Below, every letter says what it means in words a
// first year would use, and then what it is in the machine currently on the
// canvas, so the notation is never floating free of the drawing.
// ---------------------------------------------------------------------------

export interface TutorLine {
  /** The component, e.g. "Q". */
  symbol: string;
  /** What it is called. */
  name: string;
  /** What it means. No notation in here at all. */
  plain: string;
  /** What it is in the machine on the canvas right now. */
  yours: string;
}

/** What the class remembers, which is the thing that separates the four. */
const MEMORY: Record<MachineKind, string> = {
  DFA: 'Which circle it is standing in, and nothing else. That is the entire memory of a finite automaton.',
  NFA: 'Which circles it is standing in. It may be in several at once, but the set is still all it knows.',
  PDA: 'Which circle it is standing in, plus a stack it can push to and pop from, but only ever at the top.',
  TM: 'Which circle it is standing in, plus a tape it can read, overwrite and walk along in both directions.',
};

export function tupleTutor(m: Machine, level: Level): TutorLine[] {
  const l = labels(m);
  const n = m.states.length;
  const count = (k: number, one: string, many = `${one}s`): string =>
    `${k} ${k === 1 ? one : many}`;

  const lines: TutorLine[] = [
    {
      symbol: 'Q',
      name: 'the states',
      plain:
        'Every circle on the canvas. One state is one fact worth remembering. ' +
        MEMORY[level.type],
      yours:
        n === 0
          ? 'nothing drawn yet'
          : `${setOf(m.states.map((s) => s.label))}, so ${count(n, 'state')}`,
    },
    {
      symbol: 'Σ',
      name: 'the input alphabet',
      plain:
        'The symbols a string may be built from. The level fixes this: every string in the ' +
        'two lists is written in exactly these symbols, and so is every arrow you can draw.',
      yours: setOf(level.alphabet),
    },
  ];

  if (level.type === 'PDA') {
    lines.push({
      symbol: 'Γ',
      name: 'the stack alphabet',
      plain:
        'What may be pushed onto the stack. Not the same as the input alphabet: the stack is ' +
        'scratch paper, and it may hold marks that never appear in any string.',
      yours: setOf(level.stackAlphabet ?? [STACK_BOTTOM]),
    });
  }
  if (level.type === 'TM') {
    lines.push({
      symbol: 'Γ',
      name: 'the tape alphabet',
      plain:
        'What may appear on the tape. It always contains the input alphabet and the blank, ' +
        'and usually a few scratch symbols the machine writes to cross things off.',
      yours: setOf(level.tapeAlphabet ?? [...level.alphabet, BLANK]),
    });
  }

  lines.push({
    symbol: `q${SUB0}`,
    name: 'the start state',
    plain:
      'Where the machine stands before it has read anything. The stub arrow coming in from ' +
      'nowhere points at it. There is exactly one, always.',
    yours: m.start === null ? 'not set yet' : (l.get(m.start) ?? '?'),
  });

  if (level.type === 'PDA') {
    lines.push({
      symbol: `Z${SUB0}`,
      name: 'the bottom of the stack',
      plain:
        'A mark sitting on the stack before anything is pushed. Without it the machine could ' +
        'not tell an empty stack from a stack it has not looked at.',
      yours: STACK_BOTTOM,
    });
  }
  if (level.type === 'TM') {
    lines.push({
      symbol: BLANK,
      name: 'the blank',
      plain:
        'What every cell of the tape holds where nothing has been written. It is a symbol like ' +
        'any other and the machine can read it, which is how it knows the input has run out.',
      yours: BLANK,
    });
  }

  const accepting = m.accepting.map((id) => l.get(id) ?? '?').sort();
  lines.push({
    symbol: 'F',
    name: 'the accepting states',
    plain:
      'The double circles. Finish the string standing in one of these and the string is in the ' +
      'language. F may be empty, and it may be all of Q; neither is an error, both are usually wrong.',
    yours:
      accepting.length === 0 ? 'none marked yet' : `${setOf(accepting)}, out of ${count(n, 'state')}`,
  });

  const summary = deltaSummary(m, level);
  lines.push({
    symbol: 'δ',
    name: 'the transition function',
    plain:
      'The arrows, written down. Give it where you are and what you just read, and it says ' +
      'where to go. Everything the machine does is in here; the rest of the tuple only says ' +
      'what the pieces are made of.',
    yours: `${count(m.transitions.length, 'arrow')}. ${summary.note}`,
  });

  return lines;
}

/** The δ signature, taken apart into the two halves that make it readable. */
export interface DeltaTutor {
  signature: string;
  /** What you hand it. */
  input: string;
  /** What it hands back. */
  output: string;
  /** The sentence that makes the arrow make sense. */
  reading: string;
}

export function deltaTutor(kind: MachineKind): DeltaTutor {
  switch (kind) {
    case 'DFA':
      return {
        signature: deltaSignature('DFA'),
        input: 'a state, and one input symbol',
        output: 'exactly one state',
        reading:
          'Exactly one is the whole of determinism. Not two, so there is never a choice to ' +
          'make; not none, so the machine can never get stuck. That is why an unwired pair is ' +
          'flagged: a DFA with a gap is not a slow DFA, it is not a DFA.',
      };
    case 'NFA':
      return {
        signature: deltaSignature('NFA'),
        input: 'a state, and either an input symbol or ε',
        output: 'a set of states, which may be empty',
        reading:
          'Handing back a set instead of a state is what nondeterminism is. The machine stands ' +
          'in all of them at once, and the empty set is simply that branch dying. ε lets it ' +
          'move without reading anything, so a single symbol can carry it several arrows deep.',
      };
    case 'PDA':
      return {
        signature: deltaSignature('PDA'),
        input: 'a state, a symbol to read or ε, and a symbol to pop or ε',
        output: 'a set of (next state, symbol to push) pairs',
        reading:
          'The stack is what a finite automaton has not got. Pop on the way in, push on the way ' +
          'out, and matching pairs fall out for free: push while reading the first half, pop ' +
          'while reading the second, and the stack empties exactly when the counts agree.',
      };
    case 'TM':
      return {
        signature: deltaSignature('TM'),
        input: 'a state, and whatever is on the tape under the head',
        output: 'the next state, a symbol to write over it, and L or R',
        reading:
          'Writing is the new power. The tape is input and workspace at once, so the machine can ' +
          'cross a symbol off, walk back and look again. Nothing here says the walk ever ends, ' +
          'and that is not an oversight: a Turing machine is allowed to run forever.',
      };
  }
}

export interface GlossEntry {
  symbol: string;
  plain: string;
}

/** Every piece of notation the formal layer puts on screen, in words. */
export const NOTATION_GLOSSARY: GlossEntry[] = [
  { symbol: '×', plain: 'and, as a pair. Q × Σ is every way of choosing a state and a symbol.' },
  { symbol: '→', plain: 'gives back. Left of it is what you hand over, right of it what you get.' },
  { symbol: '∪', plain: 'or. Σ ∪ {ε} means an input symbol, or nothing at all.' },
  { symbol: '∩', plain: 'the things in both. A ∩ B is what A and B have in common.' },
  { symbol: '∈', plain: 'is one of. q ∈ F says the state q is one of the accepting states.' },
  { symbol: '∋', plain: 'contains, written the other way round, so the set comes first.' },
  { symbol: '∅', plain: 'the empty set. Nothing in it, and not the same as ε.' },
  { symbol: 'ε', plain: 'the empty string. Zero symbols long. Not a space, not a blank cell.' },
  { symbol: 'P(', plain: 'P(Q) is every subset of Q at once. If Q has n states, P(Q) has 2^n of them.' },
  { symbol: 'δ̂', plain: 'δ with a hat: δ run once per symbol, all the way along a string.' },
  { symbol: '⊢', plain: 'steps to. ⊢* means after any number of steps, zero included.' },
  { symbol: '|w|', plain: 'the length of w, counted in symbols.' },
  { symbol: '*', plain: 'as in Σ*: every string over Σ, of any length, the empty one included.' },
  { symbol: BLANK, plain: 'the blank tape symbol, so the machine can see where the input ran out.' },
  { symbol: STACK_BOTTOM, plain: 'the mark at the bottom of the stack, put there before anything is pushed.' },
];

/**
 * The glossary cut down to what this level actually shows. A student reading
 * about a DFA has no use for a stack marker, and a wall of symbols nobody has
 * met yet reads as noise rather than as help.
 */
export function glossaryFor(level: Level): GlossEntry[] {
  const copy = MACHINE_CLASS[level.type];
  const shown = [
    copy.definition,
    copy.acceptance,
    copy.power,
    level.theory,
    level.setBuilder,
    hierarchyRow(level.chomsky).productions,
    ...HIERARCHY.map((r) => r.example),
  ].join(' ');
  return NOTATION_GLOSSARY.filter((e) => shown.includes(e.symbol));
}

/** One-line placement of a level in the hierarchy, for the level sheet. */
export const hierarchyBlurb = (level: Level): string => {
  const row = hierarchyRow(level.chomsky);
  return `Type ${row.type}, ${row.name.toLowerCase()}. Recognised by a ${row.machine.toLowerCase()}.`;
};
