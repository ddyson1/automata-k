/**
 * The twelve levels, climbing the Chomsky hierarchy.
 *
 * `accepts` is the single source of truth for expected results. Nothing in the
 * app or the tests may hardcode a pass or fail for a particular string; the
 * grader always asks the predicate.
 */

import { BLANK, STACK_BOTTOM, type Grammar, type Level } from './types';

const count = (w: string, ch: string): number => {
  let n = 0;
  for (const c of w) if (c === ch) n++;
  return n;
};

const g = (
  nonTerminals: string[],
  terminals: string[],
  productions: [string, string][],
  note?: string,
): Grammar => ({
  nonTerminals,
  terminals,
  start: nonTerminals[0] as string,
  productions: productions.map(([lhs, rhs]) => ({ lhs, rhs })),
  ...(note ? { note } : {}),
});

export const LEVELS: Level[] = [
  // -------------------------------------------------------------------------
  // Regular languages, deterministic
  // -------------------------------------------------------------------------
  {
    id: 'dfa-ends-in-1',
    index: 1,
    type: 'DFA',
    title: 'Last symbol',
    goal: 'Accept exactly the strings that end with 1.',
    alphabet: ['0', '1'],
    par: 2,
    tests: ['', '1', '0', '01', '10', '11', '101', '110', '0101', '1110', '00001', '1010'],
    accepts: (w) => w.length > 0 && w.endsWith('1'),
    theory:
      'A finite automaton has no memory beyond the state it is in. Here one bit is enough: was the symbol I just read a 1.',
    hint: 'Two states. One means the last symbol was 1, the other means it was not. Every symbol read moves you to the state that describes it.',
    setBuilder: 'L = { w ∈ {0,1}* : w ends with 1 }',
    grammar: g(
      ['S'],
      ['0', '1'],
      [
        ['S', '0S'],
        ['S', '1S'],
        ['S', '1'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-even-zeros',
    index: 2,
    type: 'DFA',
    title: 'Parity',
    goal: 'Accept the strings containing an even number of 0s.',
    alphabet: ['0', '1'],
    par: 2,
    tests: ['', '0', '00', '1', '01', '10', '11', '000', '0110', '10101', '0000', '01110'],
    accepts: (w) => count(w, '0') % 2 === 0,
    theory:
      'A state can stand for a fact about everything read so far. Two states track a parity bit, and the machine never needs to know the actual count.',
    hint: 'The empty string has zero 0s, and zero is even, so the start state accepts. Reading 0 flips you between the two states, reading 1 leaves you where you are.',
    setBuilder: 'L = { w ∈ {0,1}* : |w|₀ is even }',
    grammar: g(
      ['S', 'A'],
      ['0', '1'],
      [
        ['S', '1S'],
        ['S', '0A'],
        ['S', ''],
        ['A', '1A'],
        ['A', '0S'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-contains-01',
    index: 3,
    type: 'DFA',
    title: 'Substring',
    goal: 'Accept the strings that contain 01 somewhere inside them.',
    alphabet: ['0', '1'],
    par: 3,
    tests: ['', '0', '1', '01', '10', '001', '110', '0101', '1111', '0000', '1001', '100'],
    accepts: (w) => w.includes('01'),
    theory:
      'Searching for a fixed pattern needs one state per amount of the pattern matched so far. Once the pattern is found the machine can never unfind it, so that state absorbs everything.',
    hint: 'Three states: nothing useful seen, a 0 seen and waiting for a 1, and found. The found state loops back to itself on both symbols.',
    setBuilder: 'L = { w ∈ {0,1}* : w = x01y for some x, y ∈ {0,1}* }',
    grammar: g(
      ['S', 'A'],
      ['0', '1'],
      [
        ['S', '0S'],
        ['S', '1S'],
        ['S', '01A'],
        ['A', '0A'],
        ['A', '1A'],
        ['A', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-no-11',
    index: 4,
    type: 'DFA',
    title: 'Forbidden pair',
    goal: 'Accept the strings with no two 1s next to each other.',
    alphabet: ['0', '1'],
    par: 3,
    tests: ['', '0', '1', '11', '01', '10', '010', '101', '0110', '1010', '00100', '110'],
    accepts: (w) => !w.includes('11'),
    theory:
      'Forbidding a pattern needs a state that cannot be escaped: the dead state. Wiring it explicitly is what makes δ total.',
    hint: 'Three states. Two of them accept, one for "the last symbol was 0 or there was none" and one for "the last symbol was 1". A 1 read in the second one sends you to a dead state that never lets go.',
    setBuilder: 'L = { w ∈ {0,1}* : 11 is not a substring of w }',
    grammar: g(
      ['S', 'A'],
      ['0', '1'],
      [
        ['S', '0S'],
        ['S', '1A'],
        ['S', ''],
        ['A', '0S'],
        ['A', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },

  // -------------------------------------------------------------------------
  // Regular languages, nondeterministic with empty moves
  // -------------------------------------------------------------------------
  {
    id: 'nfa-a-then-b',
    index: 5,
    type: 'NFA',
    title: 'Empty move',
    goal: 'Accept the strings that are some a s followed by some b s, either part possibly empty.',
    alphabet: ['a', 'b'],
    par: 2,
    tests: ['', 'a', 'b', 'ab', 'ba', 'aab', 'abb', 'aabb', 'aba', 'bab', 'bbb', 'aaa'],
    accepts: (w) => /^a*b*$/.test(w),
    theory:
      'An ε arrow changes state without reading anything. It lets one phase of a machine hand over to the next without spending a symbol.',
    hint: 'Two states, both accepting. The first loops on a, the second loops on b, and an ε arrow joins them. There is no way back.',
    setBuilder: 'L = { aⁱbʲ : i ≥ 0, j ≥ 0 }',
    grammar: g(
      ['S', 'B'],
      ['a', 'b'],
      [
        ['S', 'aS'],
        ['S', 'B'],
        ['B', 'bB'],
        ['B', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-abc-blocks',
    index: 6,
    type: 'NFA',
    title: 'Three blocks',
    goal: 'Accept some a s, then some b s, then some c s, any of the three possibly empty.',
    alphabet: ['a', 'b', 'c'],
    par: 3,
    tests: ['', 'a', 'c', 'abc', 'acb', 'aabbcc', 'ba', 'cab', 'abcc', 'bc', 'cba', 'aac'],
    accepts: (w) => /^a*b*c*$/.test(w),
    theory:
      'Concatenating languages is an ε arrow between their machines. The same construction chains any number of phases together.',
    hint: 'A chain of three self-looping states joined by ε arrows. Every state accepts, because every block is allowed to be empty.',
    setBuilder: 'L = { aⁱbʲcᵏ : i ≥ 0, j ≥ 0, k ≥ 0 }',
    grammar: g(
      ['S', 'B', 'C'],
      ['a', 'b', 'c'],
      [
        ['S', 'aS'],
        ['S', 'B'],
        ['B', 'bB'],
        ['B', 'C'],
        ['C', 'cC'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-third-last-1',
    index: 7,
    type: 'NFA',
    title: 'Guess the end',
    goal: 'Accept the strings whose third symbol from the end is a 1.',
    alphabet: ['0', '1'],
    par: 4,
    tests: ['', '1', '100', '111', '000', '0100', '1000', '0111', '110', '011', '10011', '00100'],
    accepts: (w) => w.length >= 3 && w[w.length - 3] === '1',
    theory:
      'Nondeterminism guesses. The machine bets that the 1 it is reading is the third from the end and counts two more symbols; if the bet was wrong that branch simply dies. A deterministic machine for this language needs eight states.',
    hint: 'A start state that loops on both symbols, then a 1 arrow into a tail of three states that accept anything. Only the branch that guessed correctly reaches the end.',
    setBuilder: 'L = { w ∈ {0,1}* : |w| ≥ 3 and the 3rd symbol from the right is 1 }',
    grammar: g(
      ['S', 'T', 'U'],
      ['0', '1'],
      [
        ['S', '0S'],
        ['S', '1S'],
        ['S', '1T'],
        ['T', '0U'],
        ['T', '1U'],
        ['U', '0'],
        ['U', '1'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },

  // -------------------------------------------------------------------------
  // Context free languages, pushdown automata
  // -------------------------------------------------------------------------
  {
    id: 'pda-balanced',
    index: 8,
    type: 'PDA',
    title: 'Brackets',
    goal: 'Accept the strings of brackets that are balanced.',
    alphabet: ['(', ')'],
    stackAlphabet: [STACK_BOTTOM, 'X'],
    par: 2,
    tests: ['', '()', '(())', '()()', '(', ')', '())', '(()', '(()())', ')(', '((()))', '()('],
    accepts: (w) => {
      let depth = 0;
      for (const c of w) {
        depth += c === '(' ? 1 : -1;
        if (depth < 0) return false;
      }
      return depth === 0;
    },
    theory:
      'A stack is unbounded memory with one rule: last in, first out. That is exactly enough to remember how deep you are without knowing how deep you will go.',
    hint: 'One state does the work: push X on (, pop X on ). Then an ε arrow that pops the bottom marker $ into an accepting state, which is what forces the stack to be empty at the end.',
    setBuilder: 'L = { w ∈ {(,)}* : every prefix has |w|₍ ≥ |w|₎ and |w|₍ = |w|₎ }',
    grammar: g(
      ['S'],
      ['(', ')'],
      [
        ['S', '(S)S'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-an-bn',
    index: 9,
    type: 'PDA',
    title: 'Matching counts',
    goal: 'Accept aⁿbⁿ: some a s followed by exactly as many b s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 3,
    tests: ['', 'ab', 'aabb', 'aaabbb', 'a', 'b', 'ba', 'abb', 'aab', 'abab', 'aaabb', 'aabbb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    theory:
      'This is the standard example of a language no finite automaton can recognise. The pumping lemma kills every finite-state attempt, because no fixed number of states can count without bound.',
    hint: 'Push one A per a in the first state, take an ε arrow to a second state, pop one A per b there, then an ε arrow popping $ into the accepting state.',
    setBuilder: 'L = { aⁿbⁿ : n ≥ 0 }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSb'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-palindrome',
    index: 10,
    type: 'PDA',
    title: 'Mirror',
    goal: 'Accept the even-length palindromes over a and b.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A', 'B'],
    par: 3,
    tests: ['', 'aa', 'bb', 'abba', 'baab', 'ab', 'ba', 'aba', 'abab', 'aabbaa', 'bbaabb', 'aabb'],
    accepts: (w) => w.length % 2 === 0 && w === [...w].reverse().join(''),
    theory:
      'Here the stack is not counting, it is recording. The machine must also guess where the middle is, which is why this language needs a nondeterministic pushdown automaton and not a deterministic one.',
    hint: 'First state pushes a marker for each symbol read. An ε arrow to the second state is the guess that the middle is here. The second state pops the marker that matches the symbol it reads.',
    setBuilder: 'L = { w wᴿ : w ∈ {a,b}* }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSa'],
        ['S', 'bSb'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },

  // -------------------------------------------------------------------------
  // Turing machines
  // -------------------------------------------------------------------------
  {
    id: 'tm-an-bn',
    index: 11,
    type: 'TM',
    title: 'Cross off',
    goal: 'Accept aⁿbⁿ again, this time on a tape you can rewrite.',
    alphabet: ['a', 'b'],
    tapeAlphabet: ['a', 'b', 'X', 'Y', BLANK],
    par: 5,
    tests: ['', 'ab', 'aabb', 'aaabbb', 'a', 'b', 'ba', 'abb', 'aab', 'aba', 'aabbb', 'aaabb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    theory:
      'A tape can be read and written in any order, so a Turing machine can mark cells and come back. Marking one a and one b at a time and sweeping back is the basic idiom of every tape algorithm.',
    hint: 'Cross the leftmost a as X, walk right past a s and Y s to the first b, cross it as Y, walk back left to the X, and repeat. When no a s remain, check that only Y s stand between you and the blank.',
    setBuilder: 'L = { aⁿbⁿ : n ≥ 0 }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSb'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'tm-an-bn-cn',
    index: 12,
    type: 'TM',
    title: 'Beyond context free',
    goal: 'Accept aⁿbⁿcⁿ: equal runs of a, b and c in that order.',
    alphabet: ['a', 'b', 'c'],
    tapeAlphabet: ['a', 'b', 'c', 'X', 'Y', 'Z', BLANK],
    par: 6,
    tests: [
      '',
      'abc',
      'aabbcc',
      'aaabbbccc',
      'ab',
      'abcc',
      'aabbc',
      'abbc',
      'acb',
      'aabbccc',
      'cba',
      'aabcc',
    ],
    accepts: (w) =>
      /^a*b*c*$/.test(w) && count(w, 'a') === count(w, 'b') && count(w, 'b') === count(w, 'c'),
    theory:
      'No pushdown automaton recognises this language: one stack can match a against b or b against c, never both. It is context sensitive, one full step up the hierarchy, and a tape handles it without effort.',
    hint: 'The same cross-off loop as before, one pass per triple. Mark an a as X, the next b as Y, the next c as Z, sweep back to the X and go again. At the end only Y s and Z s may remain.',
    setBuilder: 'L = { aⁿbⁿcⁿ : n ≥ 0 }',
    grammar: g(
      ['S', 'B', 'C'],
      ['a', 'b', 'c'],
      [
        ['S', ''],
        ['S', 'aBC'],
        ['S', 'aSBC'],
        ['CB', 'BC'],
        ['aB', 'ab'],
        ['bB', 'bb'],
        ['bC', 'bc'],
        ['cC', 'cc'],
      ],
      'Context sensitive. Every rule other than S → ε is non-contracting, and CB → BC is the rule that does the sorting.',
    ),
    chomsky: 1,
    exhaustiveMaxLength: 9,
  },
];

export const LEVEL_BY_ID: Record<string, Level> = Object.fromEntries(
  LEVELS.map((l) => [l.id, l]),
);

export const levelAt = (index: number): Level | undefined =>
  LEVELS.find((l) => l.index === index);

/** Levels unlock in order: level n is playable once level n-1 is solved. */
export const isUnlocked = (level: Level, solvedIds: readonly string[]): boolean =>
  level.index === 1 || LEVELS.some((l) => l.index === level.index - 1 && solvedIds.includes(l.id));

/** Every string over the alphabet up to `maxLength`, shortest first. */
export function enumerateStrings(alphabet: readonly string[], maxLength: number): string[] {
  const out: string[] = [''];
  let frontier: string[] = [''];
  for (let len = 1; len <= maxLength; len++) {
    const next: string[] = [];
    for (const w of frontier) for (const a of alphabet) next.push(w + a);
    out.push(...next);
    frontier = next;
  }
  return out;
}
