/**
 * The golden fixture.
 *
 * The TypeScript engine is the proven one: 9.1 checks every level's verified
 * solution against its `accepts` predicate over every string up to length 6,
 * length 9 for aⁿbⁿcⁿ. The Swift port cannot be run in every environment, so
 * this freezes that proof into a file both engines can be held to.
 *
 * For each level it emits the level's shape, its verified solution, its
 * grammar, and the language itself as a bitmap over the canonical enumeration
 * of Σ* up to the level's depth. Any engine that can enumerate the same
 * strings can check itself against it, in any language.
 */

import { LEVELS, enumerateStrings } from '../src/engine/levels';
import { solutionFor } from '../src/engine/solutions';
import type { Level, Machine } from '../src/engine/types';

export interface GoldenLevel {
  id: string;
  index: number;
  type: string;
  title: string;
  /** The question, in the words the rail and the brief show. */
  goal: string;
  /** The same language, in set-builder notation. */
  setBuilder: string;
  /** A nudge, shown under Stuck. */
  hint: string;
  /** Why this language needs this class of machine. */
  theory: string;
  /** Where the language sits in the hierarchy: 3 regular down to 0. */
  chomsky: number;
  alphabet: string[];
  stackAlphabet?: string[];
  tapeAlphabet?: string[];
  par: number;
  maxLength: number;
  tests: string[];
  /** Expected verdict per test string, from the level predicate. */
  testVerdicts: boolean[];
  solution: Machine;
  grammar: {
    nonTerminals: string[];
    terminals: string[];
    start: string;
    productions: { lhs: string; rhs: string }[];
    /** How much longer than the target a sentential form may get. */
    slack: number;
  };
  /**
   * The language over `enumerate(alphabet, maxLength)`, one bit per string in
   * that exact order, packed little end first and base64 encoded.
   */
  languageBits: string;
  /** Length of the enumeration, so a reader can check it built the same list. */
  stringCount: number;
}

export interface GoldenFile {
  /** Bumped whenever the shape changes, so a stale fixture is obvious. */
  version: number;
  generatedFrom: string;
  totals: { levels: number; strings: number; tests: number };
  levels: GoldenLevel[];
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(binary);
};

/** Pack booleans into bytes, bit 0 of byte 0 being the first string. */
export function packBits(values: boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(values.length / 8));
  values.forEach((v, i) => {
    if (v) {
      const byte = i >> 3;
      bytes[byte] = (bytes[byte] as number) | (1 << (i & 7));
    }
  });
  return toBase64(bytes);
}

export function unpackBits(base64: string, count: number): boolean[] {
  const binary =
    typeof Buffer !== 'undefined'
      ? Buffer.from(base64, 'base64')
      : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const out: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const byte = binary[i >> 3] ?? 0;
    out.push((byte & (1 << (i & 7))) !== 0);
  }
  return out;
}

/** Matches the slack used by the grammar suite in tests/grammar.test.ts. */
const slackFor = (level: Level): number => (level.chomsky === 1 ? 2 : 6);

export function buildGolden(): GoldenFile {
  let strings = 0;
  let tests = 0;

  const levels: GoldenLevel[] = LEVELS.map((level) => {
    const words = enumerateStrings(level.alphabet, level.exhaustiveMaxLength);
    strings += words.length;
    tests += level.tests.length;

    return {
      id: level.id,
      index: level.index,
      type: level.type,
      title: level.title,
      goal: level.goal,
      setBuilder: level.setBuilder,
      hint: level.hint,
      theory: level.theory,
      chomsky: level.chomsky,
      alphabet: [...level.alphabet],
      ...(level.stackAlphabet ? { stackAlphabet: [...level.stackAlphabet] } : {}),
      ...(level.tapeAlphabet ? { tapeAlphabet: [...level.tapeAlphabet] } : {}),
      par: level.par,
      maxLength: level.exhaustiveMaxLength,
      tests: [...level.tests],
      testVerdicts: level.tests.map((w) => level.accepts(w)),
      solution: solutionFor(level.id) as Machine,
      grammar: {
        nonTerminals: [...level.grammar.nonTerminals],
        terminals: [...level.grammar.terminals],
        start: level.grammar.start,
        productions: level.grammar.productions.map((p) => ({ lhs: p.lhs, rhs: p.rhs })),
        slack: slackFor(level),
      },
      languageBits: packBits(words.map((w) => level.accepts(w))),
      stringCount: words.length,
    };
  });

  return {
    version: 1,
    generatedFrom: 'src/engine, verified by tests/engine.test.ts and tests/grammar.test.ts',
    totals: { levels: levels.length, strings, tests },
    levels,
  };
}
