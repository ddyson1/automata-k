/**
 * Section 9.2: grammars.
 *
 * Each grammar in the formal layer is derived by breadth-first search over
 * sentential forms with a length cap, and the generated set is asserted equal
 * to the level's language over the same range. A single wrong production shows
 * up here immediately, including in the context sensitive grammar for aⁿbⁿcⁿ.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { grammarLines } from '../src/engine/formal';
import { LEVELS, enumerateStrings } from '../src/engine/levels';
import type { Grammar, Level } from '../src/engine/types';

const tally = {
  grammars: 0,
  formsExplored: 0,
  stringsCompared: 0,
  mismatches: 0,
};

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  9.2 grammars',
      `    grammars derived         ${tally.grammars}`,
      `    sentential forms visited ${tally.formsExplored}`,
      `    strings compared         ${tally.stringsCompared}`,
      `    mismatches               ${tally.mismatches}`,
      '',
    ].join('\n'),
  );
});

/**
 * How much longer than the target string a sentential form is allowed to get.
 *
 * Every production of a context sensitive grammar is non contracting apart from
 * S -> ε, and this grammar can apply that at most once, so forms in a
 * derivation of a length L string never exceed L + 1. Context free grammars
 * here hold several pending non terminals at once and need more room.
 */
const slackFor = (level: Level): number => (level.chomsky === 1 ? 2 : 6);

interface DerivationResult {
  words: Set<string>;
  formsExplored: number;
}

/**
 * Breadth first search over sentential forms. Symbols are single characters,
 * so a production is applied by substring replacement at every occurrence of
 * its left-hand side.
 */
function derive(grammar: Grammar, maxLength: number, slack: number): DerivationResult {
  const cap = maxLength + slack;
  const terminals = new Set(grammar.terminals);
  const isTerminal = (form: string): boolean => [...form].every((c) => terminals.has(c));

  const seen = new Set<string>([grammar.start]);
  const queue: string[] = [grammar.start];
  const words = new Set<string>();
  let head = 0;

  while (head < queue.length) {
    const form = queue[head++] as string;
    if (isTerminal(form)) {
      if (form.length <= maxLength) words.add(form);
      // No production can apply: every left-hand side contains a non terminal.
      continue;
    }
    for (const p of grammar.productions) {
      let at = form.indexOf(p.lhs);
      while (at !== -1) {
        const next = form.slice(0, at) + p.rhs + form.slice(at + p.lhs.length);
        if (next.length <= cap && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
        at = form.indexOf(p.lhs, at + 1);
      }
    }
  }

  return { words, formsExplored: seen.size };
}

describe('grammars are well formed', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level) => {
    const gr = level.grammar;
    expect(gr.nonTerminals).toContain(gr.start);
    expect(new Set(gr.terminals)).toEqual(new Set(level.alphabet));

    const known = new Set([...gr.nonTerminals, ...gr.terminals]);
    for (const p of gr.productions) {
      expect(p.lhs.length, `${p.lhs} -> ${p.rhs} has an empty left-hand side`).toBeGreaterThan(0);
      expect(
        [...p.lhs].some((c) => gr.nonTerminals.includes(c)),
        `${p.lhs} -> ${p.rhs} must rewrite a non terminal`,
      ).toBe(true);
      for (const c of p.lhs + p.rhs) {
        expect(known.has(c), `${c} in ${p.lhs} -> ${p.rhs} is not declared`).toBe(true);
      }
    }
  });

  it('renders every grammar as readable production lines', () => {
    for (const level of LEVELS) {
      const lines = grammarLines(level.grammar);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]?.startsWith(`${level.grammar.start} → `)).toBe(true);
      for (const line of lines) expect(line).not.toContain('undefined');
    }
  });
});

describe.each(LEVELS.map((l) => [l.index, l.id, l] as const))(
  'grammar for level %i %s',
  (_index, _id, level) => {
    it(`generates exactly the language up to length ${level.exhaustiveMaxLength}`, () => {
      const max = level.exhaustiveMaxLength;
      const { words, formsExplored } = derive(level.grammar, max, slackFor(level));

      const expected = new Set(
        enumerateStrings(level.alphabet, max).filter((w) => level.accepts(w)),
      );

      const overGenerated = [...words].filter((w) => !expected.has(w)).sort();
      const underGenerated = [...expected].filter((w) => !words.has(w)).sort();

      tally.grammars += 1;
      tally.formsExplored += formsExplored;
      tally.stringsCompared += expected.size + words.size;
      tally.mismatches += overGenerated.length + underGenerated.length;

      expect(
        overGenerated.slice(0, 12),
        'derived but not in the language',
      ).toEqual([]);
      expect(
        underGenerated.slice(0, 12),
        'in the language but not derivable',
      ).toEqual([]);
    });
  },
);

describe('the derivation harness itself', () => {
  it('catches a wrong production', () => {
    const level = LEVELS.find((l) => l.id === 'pda-an-bn') as Level;
    const broken: Grammar = {
      ...level.grammar,
      productions: [
        { lhs: 'S', rhs: 'aSbb' },
        { lhs: 'S', rhs: '' },
      ],
    };
    const { words } = derive(broken, 6, 6);
    const expected = new Set(enumerateStrings(level.alphabet, 6).filter((w) => level.accepts(w)));
    const same =
      words.size === expected.size && [...words].every((w) => expected.has(w));
    expect(same).toBe(false);
  });

  it('catches a wrong production in the context sensitive grammar', () => {
    const level = LEVELS.find((l) => l.id === 'tm-an-bn-cn') as Level;
    const broken: Grammar = {
      ...level.grammar,
      // CB -> BC is what sorts the block. Without it nothing past n = 1 derives.
      productions: level.grammar.productions.filter((p) => p.lhs !== 'CB'),
    };
    const { words } = derive(broken, 9, slackFor(level));
    expect(words.has('abc')).toBe(true);
    expect(words.has('aabbcc')).toBe(false);
  });
});
