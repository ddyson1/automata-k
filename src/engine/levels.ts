/**
 * The 21 levels, climbing the Chomsky hierarchy.
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

/**
 * The campaign, in order. Position is the level number, so adding one is a
 * single insert: nothing here is numbered by hand, and nothing renumbers.
 */
/**
 * The campaign, in order. Position is the level number, so adding one is a
 * single insert: nothing here is numbered by hand, and nothing renumbers.
 */
const CAMPAIGN: Omit<Level, 'index'>[] = [  // -------------------------------------------------------------------------
  // Regular languages, deterministic
  // -------------------------------------------------------------------------
  {
    id: 'dfa-ends-in-1',
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
    id: 'dfa-length-mod-three',
    type: 'DFA',
    title: 'Counting in threes',
    goal: 'Accept the strings whose length is a multiple of three.',
    alphabet: ['a', 'b'],
    par: 3,
    tests: ['', 'aaa', 'aba', 'bbb', 'aabbaa', 'ababab', 'a', 'b', 'ab', 'ba', 'aaaa', 'abab'],
    accepts: (w) => w.length % 3 === 0,
    theory:
      'Nothing about the symbols matters, only how many there have been, and only that count modulo three. A machine that counted properly would need a state per length and there is no end to those, so it counts the remainder instead and goes round.',
    hint: 'Three states in a ring. Every symbol steps one place round it, whichever symbol it is. Accept where you started.',
    setBuilder: 'L = { w ∈ {a,b}* : |w| ≡ 0 mod 3 }',
    grammar: g(
      ['A', 'B', 'C'],
      ['a', 'b'],
      [
        ['A', 'aB'],
        ['A', 'bB'],
        ['A', ''],
        ['B', 'aC'],
        ['B', 'bC'],
        ['C', 'aA'],
        ['C', 'bA'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-contains-01',
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
    id: 'dfa-ends-in-00',
    type: 'DFA',
    title: 'Two zeros to finish',
    goal: 'Accept the strings that end with 00.',
    alphabet: ['0', '1'],
    par: 3,
    tests: ['00', '000', '100', '1100', '0100', '10100', '', '0', '1', '01', '10', '1101'],
    accepts: (w) => w.endsWith('00'),
    theory:
      'A machine cannot look back at what it has read, so it carries the answer forward: how much of the ending it is currently sitting on. Reading a 1 throws that progress away, and reading a 0 adds to it, up to the two that are needed.',
    hint: 'Three states: no run of zeros, one zero, two or more. A 1 sends every one of them back to the first.',
    setBuilder: 'L = { w ∈ {0,1}* : w ends with 00 }',
    grammar: g(
      ['S', 'A', 'B'],
      ['0', '1'],
      [
        ['S', '0A'],
        ['S', '1S'],
        ['A', '0B'],
        ['A', '1S'],
        ['B', '0B'],
        ['B', '1S'],
        ['B', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-no-11',
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
  {
    id: 'dfa-at-least-two-ones',
    type: 'DFA',
    title: 'At least two',
    goal: 'Accept the strings containing at least two 1s.',
    alphabet: ['0', '1'],
    par: 3,
    tests: ['11', '011', '110', '1010', '0110', '111', '', '0', '1', '00', '01', '000'],
    accepts: (w) => count(w, '1') >= 2,
    theory:
      'Counting to a threshold needs one state per amount counted so far and one more for "enough", and no more than that: past two, the machine stops caring how many there are. That last state absorbs everything, which is what makes the language regular however large the threshold.',
    hint: 'Three states: none seen, one seen, two or more. The last one loops on both symbols and never lets go.',
    setBuilder: 'L = { w ∈ {0,1}* : |w|₁ ≥ 2 }',
    grammar: g(
      ['A', 'B', 'C'],
      ['0', '1'],
      [
        ['A', '0A'],
        ['A', '1B'],
        ['B', '0B'],
        ['B', '1C'],
        ['C', '0C'],
        ['C', '1C'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-div-by-three',
    type: 'DFA',
    title: 'Divisible by three',
    goal: 'Accept the strings that read, as a binary number, as a multiple of three.',
    alphabet: ['0', '1'],
    par: 3,
    tests: ['', '0', '1', '11', '10', '00', '101', '110', '111', '1001', '1100', '1010'],
    accepts: (w) => {
      let r = 0;
      for (const c of w) r = (2 * r + (c === '1' ? 1 : 0)) % 3;
      return r === 0;
    },
    theory:
      'One state per remainder. Reading a bit doubles the number so far and adds the bit, and the new remainder depends only on the old remainder and the bit, never on the number itself. Three facts are enough, so three states are enough, however long the string gets.',
    hint: 'Three states, one for each remainder: 0, 1, 2. From remainder r, reading bit b lands on (2r + b) mod 3. Accept remainder 0, which is also where the empty string leaves you.',
    setBuilder: 'L = { w ∈ {0,1}* : the binary number w is divisible by 3 }',
    grammar: g(
      ['A', 'B', 'C'],
      ['0', '1'],
      [
        ['A', '0A'],
        ['A', '1B'],
        ['A', ''],
        ['B', '0C'],
        ['B', '1A'],
        ['C', '0B'],
        ['C', '1C'],
      ],
      'One non terminal per remainder, so the grammar is the machine written sideways.',
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-alternating',
    type: 'DFA',
    title: 'Never twice in a row',
    goal: 'Accept the strings that never repeat a symbol twice in a row.',
    alphabet: ['a', 'b'],
    par: 4,
    tests: ['', 'a', 'b', 'ab', 'ba', 'aba', 'bab', 'abab', 'aa', 'bb', 'aab', 'abba'],
    accepts: (w) => ![...w].some((c, i) => i > 0 && c === w[i - 1]),
    theory:
      'The only thing worth remembering is the symbol just read, so there is one state per symbol, plus the state before anything has been read. A repeat has nowhere to go, and the fourth state is where nowhere is.',
    hint: 'One state for "last was a" and one for "last was b", both accepting. A repeat leads to a state with no way out, which is what a rejection looks like in a machine that must always have somewhere to go.',
    setBuilder: 'L = { w ∈ {a,b}* : no two adjacent symbols of w are equal }',
    grammar: g(
      ['S', 'A', 'B'],
      ['a', 'b'],
      [
        ['S', 'aA'],
        ['S', 'bB'],
        ['S', ''],
        ['A', 'bB'],
        ['A', ''],
        ['B', 'aA'],
        ['B', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-exactly-two-zeros',
    type: 'DFA',
    title: 'Exactly two',
    goal: 'Accept the strings containing exactly two 0s.',
    alphabet: ['0', '1'],
    par: 4,
    tests: ['00', '001', '100', '0110', '1001', '10011', '', '0', '1', '000', '0001', '0000'],
    accepts: (w) => count(w, '0') === 2,
    theory:
      'Exactly is at least and at most at once, and at most is the part that costs a state: the machine has to be able to notice a third 0 and refuse. Compare the level before, where past two nothing could go wrong and three states were enough.',
    hint: 'Four states: none, one, two, and too many. Only the third accepts, and the fourth never lets go.',
    setBuilder: 'L = { w ∈ {0,1}* : |w|₀ = 2 }',
    grammar: g(
      ['A', 'B', 'C'],
      ['0', '1'],
      [
        ['A', '1A'],
        ['A', '0B'],
        ['B', '1B'],
        ['B', '0C'],
        ['C', '1C'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-starts-with-ab',
    type: 'DFA',
    title: 'How it begins',
    goal: 'Accept the strings that begin with ab.',
    alphabet: ['a', 'b'],
    par: 4,
    tests: ['ab', 'aba', 'abb', 'abab', 'abbbb', 'ababab', '', 'a', 'b', 'aa', 'ba', 'bab'],
    accepts: (w) => w.startsWith('ab'),
    theory:
      'The mirror of the ending levels, and much easier: a beginning is decided before the machine has read anything else, so the answer is settled after two symbols and the rest of the string cannot change it. Both accepting and rejecting become absorbing.',
    hint: 'Two states to read the ab, one accepting state that loops on everything, and one dead state for every other opening.',
    setBuilder: 'L = { w ∈ {a,b}* : w begins with ab }',
    grammar: g(
      ['S', 'B', 'C'],
      ['a', 'b'],
      [
        ['S', 'aB'],
        ['B', 'bC'],
        ['C', 'aC'],
        ['C', 'bC'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-even-both',
    type: 'DFA',
    title: 'Both even',
    goal: 'Accept the strings with an even number of 0s and an even number of 1s.',
    alphabet: ['0', '1'],
    par: 4,
    tests: ['', '00', '11', '0011', '1100', '0101', '0', '1', '01', '10', '000', '0111'],
    accepts: (w) => count(w, '0') % 2 === 0 && count(w, '1') % 2 === 0,
    theory:
      'Two independent facts, each with two possible values, so four states: the product of a two state machine with another two state machine. Every symbol flips exactly one of the two parities, which is why no state ever needs to be added.',
    hint: 'Four states, one for each pair of parities. Reading 0 flips the first, reading 1 flips the second. Accept the one where both are even, which is where you start.',
    setBuilder: 'L = { w ∈ {0,1}* : |w|₀ is even and |w|₁ is even }',
    grammar: g(
      ['A', 'B', 'C', 'D'],
      ['0', '1'],
      [
        ['A', '0B'],
        ['A', '1C'],
        ['A', ''],
        ['B', '0A'],
        ['B', '1D'],
        ['C', '0D'],
        ['C', '1A'],
        ['D', '0C'],
        ['D', '1B'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-third-is-1',
    type: 'DFA',
    title: 'Third from the left',
    goal: 'Accept the strings at least three long whose third symbol is 1.',
    alphabet: ['0', '1'],
    par: 5,
    tests: ['001', '011', '111', '0110', '1010', '00110', '', '0', '01', '000', '110', '0100'],
    accepts: (w) => w.length >= 3 && w[2] === '1',
    theory:
      'Counting from the left is free: the machine steps to the third position and looks. Counting from the right is not, and the level in the next group asks for exactly that, which is where nondeterminism starts to pay.',
    hint: 'Walk two states along on either symbol, then branch on the third: a 1 into an accepting state that loops, a 0 into one that does not.',
    setBuilder: 'L = { w ∈ {0,1}* : |w| ≥ 3 and w₃ = 1 }',
    grammar: g(
      ['S', 'A', 'B', 'C'],
      ['0', '1'],
      [
        ['S', '0A'],
        ['S', '1A'],
        ['A', '0B'],
        ['A', '1B'],
        ['B', '1C'],
        ['C', '0C'],
        ['C', '1C'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'dfa-same-ends',
    type: 'DFA',
    title: 'Matching ends',
    goal: 'Accept the non empty strings that begin and end with the same symbol.',
    alphabet: ['0', '1'],
    par: 5,
    tests: ['0', '1', '00', '11', '010', '101', '0110', '1001', '', '01', '10', '011', '100'],
    accepts: (w) => w.length > 0 && w[0] === w[w.length - 1],
    theory:
      'The machine cannot look back at the first symbol, so it has to carry it: one branch for a string that began with 0 and one for a string that began with 1. Inside each branch it only needs to remember the symbol it just read, which is two more states, and the start state makes five.',
    hint: 'Commit on the first symbol into one of two halves and never leave that half. Inside a half, track the last symbol read; accept when the last symbol matches the first.',
    setBuilder: 'L = { w ∈ {0,1}⁺ : w₁ = w_|w| }',
    grammar: g(
      ['S', 'A', 'B'],
      ['0', '1'],
      [
        ['S', '0A'],
        ['S', '1B'],
        ['S', '0'],
        ['S', '1'],
        ['A', '0A'],
        ['A', '1A'],
        ['A', '0'],
        ['B', '0B'],
        ['B', '1B'],
        ['B', '1'],
      ],
      'S commits to the first symbol; A finishes on a 0 and B finishes on a 1.',
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },

  // -------------------------------------------------------------------------
  // Regular languages, nondeterministic with empty moves
  // -------------------------------------------------------------------------
  {
    id: 'nfa-a-then-b',
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
    setBuilder: 'L = { a^ib^j : i ≥ 0, j ≥ 0 }',
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
    id: 'nfa-all-one-symbol',
    type: 'NFA',
    title: 'One or the other',
    goal: 'Accept the strings that are all a s or all b s.',
    alphabet: ['a', 'b'],
    par: 3,
    tests: ['', 'a', 'b', 'aa', 'bb', 'aaa', 'bbb', 'ab', 'ba', 'aab', 'abb', 'bab'],
    accepts: (w) => /^a*$/.test(w) || /^b*$/.test(w),
    theory:
      'A union of two languages is two machines side by side, and the start state simply belongs to both of them. Nothing here needs an empty move yet, because the first symbol already decides which half the string is in.',
    hint: 'One start state, accepting, with an a arrow into a loop of a s and a b arrow into a loop of b s. Neither loop has a way back.',
    setBuilder: 'L = { aⁿ : n ≥ 0 } ∪ { bⁿ : n ≥ 0 }',
    grammar: g(
      ['S', 'A', 'B'],
      ['a', 'b'],
      [
        ['S', 'aA'],
        ['S', 'bB'],
        ['S', ''],
        ['A', 'aA'],
        ['A', ''],
        ['B', 'bB'],
        ['B', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-abc-blocks',
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
    setBuilder: 'L = { a^ib^jc^k : i ≥ 0, j ≥ 0, k ≥ 0 }',
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
    id: 'nfa-second-last-a',
    type: 'NFA',
    title: 'Second from the right',
    goal: 'Accept the strings whose second symbol from the right is a.',
    alphabet: ['a', 'b'],
    par: 3,
    tests: ['aa', 'ab', 'aab', 'baa', 'abab', 'bbab', '', 'a', 'b', 'ba', 'bb', 'abba'],
    accepts: (w) => w.length >= 2 && w[w.length - 2] === 'a',
    theory:
      'Reading left to right, nothing tells the machine that the end is coming. So it guesses: at some a it decides that this is the one, and if exactly one symbol follows, the guess was right. A deterministic machine would have to remember the last two symbols instead, which costs four states rather than three.',
    hint: 'A loop on both symbols, one a arrow out of it, and then one arrow on either symbol into the accepting state.',
    setBuilder: 'L = { w ∈ {a,b}* : |w| ≥ 2 and w_{|w|-1} = a }',
    grammar: g(
      ['S', 'A'],
      ['a', 'b'],
      [
        ['S', 'aS'],
        ['S', 'bS'],
        ['S', 'aA'],
        ['A', 'a'],
        ['A', 'b'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-ends-with-abb',
    type: 'NFA',
    title: 'Three to finish',
    goal: 'Accept the strings that end with abb.',
    alphabet: ['a', 'b'],
    par: 4,
    tests: ['abb', 'aabb', 'babb', 'abbabb', 'bbabb', 'ababb', '', 'a', 'ab', 'abba', 'bb', 'aab'],
    accepts: (w) => w.endsWith('abb'),
    theory:
      'The textbook example of nondeterminism costing nothing to write. The machine loops on everything and then simply spells out the ending it wants; the deterministic version has to track how much of abb it has half seen, and put every wrong turn back in the right place.',
    hint: 'A loop on both symbols, then a, then b, then b. Four states in a line and no cleverness anywhere.',
    setBuilder: 'L = { w ∈ {a,b}* : w ends with abb }',
    grammar: g(
      ['S', 'A', 'B'],
      ['a', 'b'],
      [
        ['S', 'aS'],
        ['S', 'bS'],
        ['S', 'aA'],
        ['A', 'bB'],
        ['B', 'b'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-ends-ab-or-ba',
    type: 'NFA',
    title: 'Either ending',
    goal: 'Accept the strings that end with ab or with ba.',
    alphabet: ['a', 'b'],
    par: 4,
    tests: ['ab', 'ba', 'aab', 'bba', 'abab', 'baba', '', 'a', 'b', 'aa', 'bb', 'aaa'],
    accepts: (w) => w.endsWith('ab') || w.endsWith('ba'),
    theory:
      'A deterministic machine would have to know, at every symbol, which of the two endings it is in the middle of. A nondeterministic one guesses: it sits in a loop reading anything, and at some point simply decides that the last two symbols have started. Only a guess that turns out right survives.',
    hint: 'One state loops on both symbols. From it, one arrow on a and one on b lead into two short tails, and both tails end at the same accepting state.',
    setBuilder: 'L = { w ∈ {a,b}* : w ends with ab or ba }',
    grammar: g(
      ['S', 'A', 'B'],
      ['a', 'b'],
      [
        ['S', 'aS'],
        ['S', 'bS'],
        ['S', 'aA'],
        ['S', 'bB'],
        ['A', 'b'],
        ['B', 'a'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-third-last-1',
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
  {
    id: 'nfa-contains-aa-or-bb',
    type: 'NFA',
    title: 'A pair, either way',
    goal: 'Accept the strings that contain aa or bb somewhere.',
    alphabet: ['a', 'b'],
    par: 4,
    tests: ['aa', 'bb', 'aab', 'abb', 'abba', 'baab', '', 'a', 'b', 'ab', 'ba', 'abab'],
    accepts: (w) => w.includes('aa') || w.includes('bb'),
    theory:
      'Two patterns, either of which will do, and the machine does not have to decide which it is looking for. It guesses at the start of a candidate pair and the guesses that fail simply die; only a branch that survives to the end counts.',
    hint: 'A loop that reads anything, two short tails for the two pairs, and one accepting state at the end of both that loops on everything.',
    setBuilder: 'L = { w ∈ {a,b}* : aa or bb is a substring of w }',
    grammar: g(
      ['S', 'A', 'B', 'C'],
      ['a', 'b'],
      [
        ['S', 'aS'],
        ['S', 'bS'],
        ['S', 'aA'],
        ['S', 'bB'],
        ['A', 'aC'],
        ['B', 'bC'],
        ['C', 'aC'],
        ['C', 'bC'],
        ['C', ''],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-even-a-or-even-b',
    type: 'NFA',
    title: 'Either parity',
    goal: 'Accept the strings with an even number of a s or an even number of b s.',
    alphabet: ['a', 'b'],
    par: 5,
    tests: ['', 'aa', 'bb', 'ab', 'ba', 'aabb', 'abab', 'aba', 'bab', 'aaabbb', 'abb', 'aabbb'],
    accepts: (w) => count(w, 'a') % 2 === 0 || count(w, 'b') % 2 === 0,
    theory:
      'Two machines that each watch one letter, joined by an empty move that picks one before anything is read. Determinising this is the product construction from the sixth level, and it comes out at four states rather than five, which is the usual way round: nondeterminism is easier to write and not always smaller.',
    hint: 'A start state with two empty arrows, into a two state parity machine for a and a two state parity machine for b. Each machine ignores the letter it is not watching.',
    setBuilder: 'L = { w ∈ {a,b}* : |w|ₐ is even or |w|_b is even }',
    grammar: g(
      ['A', 'B', 'C', 'D'],
      ['a', 'b'],
      [
        ['A', 'aB'],
        ['A', 'bC'],
        ['A', ''],
        ['B', 'aA'],
        ['B', 'bD'],
        ['B', ''],
        ['C', 'aD'],
        ['C', 'bA'],
        ['C', ''],
        ['D', 'aC'],
        ['D', 'bB'],
      ],
    ),
    chomsky: 3,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'nfa-two-or-three',
    type: 'NFA',
    title: 'Two or three',
    goal: 'Accept the strings whose length is a multiple of two or a multiple of three.',
    alphabet: ['a'],
    par: 6,
    tests: ['', 'a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa', 'aaaaaaa', 'aaaaaaaa', 'aaaaaaaaa'],
    accepts: (w) => w.length % 2 === 0 || w.length % 3 === 0,
    theory:
      'Or is where empty moves earn their keep. Build the two machines separately, a loop of two and a loop of three, and let the start state step into either one without reading anything. The guess is made before the first symbol and never revisited.',
    hint: 'A start state with two empty arrows out of it, into a two cycle and into a three cycle. Both cycles have their entry state accepting, which is also what lets the empty string through.',
    setBuilder: 'L = { aⁿ : n ≡ 0 mod 2 or n ≡ 0 mod 3 }',
    grammar: g(
      ['A', 'B', 'C', 'D', 'E', 'F'],
      ['a'],
      [
        ['A', 'aB'],
        ['A', ''],
        ['B', 'aC'],
        ['C', 'aD'],
        ['C', ''],
        ['D', 'aE'],
        ['D', ''],
        ['E', 'aF'],
        ['E', ''],
        ['F', 'aA'],
      ],
      'The two loops joined by empty moves are one loop of six in disguise: a length fails only when it is 1 or 5 more than a multiple of six.',
    ),
    chomsky: 3,
    exhaustiveMaxLength: 9,
  },

  // -------------------------------------------------------------------------
  // Context free languages, pushdown automata
  // -------------------------------------------------------------------------
  {
    id: 'pda-balanced',
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
    setBuilder: 'L = { w ∈ {(,)}* : no prefix has more ) than (, and w has equally many of each }',
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
    type: 'PDA',
    title: 'Matching counts',
    goal: 'Accept a^nb^n: some a s followed by exactly as many b s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 3,
    tests: ['', 'ab', 'aabb', 'aaabbb', 'a', 'b', 'ba', 'abb', 'aab', 'abab', 'aaabb', 'aabbb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    theory:
      'This is the standard example of a language no finite automaton can recognise. The pumping lemma kills every finite-state attempt, because no fixed number of states can count without bound.',
    hint: 'Push one A per a in the first state, take an ε arrow to a second state, pop one A per b there, then an ε arrow popping $ into the accepting state.',
    setBuilder: 'L = { a^nb^n : n ≥ 0 }',
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
    id: 'pda-an-le-bm',
    type: 'PDA',
    title: 'At least as many',
    goal: 'Accept some a s followed by at least as many b s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 3,
    tests: ['', 'ab', 'abb', 'aabb', 'aabbb', 'b', 'a', 'ba', 'aab', 'abab', 'aaab', 'aa'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') <= count(w, 'b'),
    theory:
      'An inequality rather than an equality, and the stack takes it in its stride: push a mark per a, spend one per b, and when the marks run out keep reading b s. What the stack cannot do is notice that it has run out too early, which is exactly what makes the other direction a different machine.',
    hint: 'Push on every a. Pop on every b until the bottom of the stack shows, then move on and let any remaining b s go past unchallenged.',
    setBuilder: 'L = { aⁿbᵐ : 0 ≤ n ≤ m }',
    grammar: g(
      ['S', 'B'],
      ['a', 'b'],
      [
        ['S', 'aSb'],
        ['S', 'bB'],
        ['S', ''],
        ['B', 'bB'],
        ['B', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-an-ge-bm',
    type: 'PDA',
    title: 'No more than',
    goal: 'Accept some a s followed by no more b s than there were a s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 4,
    tests: ['', 'a', 'aa', 'ab', 'aab', 'aabb', 'aaab', 'b', 'abb', 'ba', 'abab', 'aabbb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') >= count(w, 'b'),
    theory:
      'The other inequality, and it costs a state. The b s stop before the marks do, so the machine is left holding a stack it has to empty before it can see the bottom, and emptying it takes moves that read nothing at all.',
    hint: 'Push on every a, pop on every b, and then a state that keeps popping on empty moves until the bottom of the stack is showing.',
    setBuilder: 'L = { aⁿbᵐ : m ≤ n }',
    grammar: g(
      ['S', 'A'],
      ['a', 'b'],
      [
        ['S', 'aSb'],
        ['S', 'aA'],
        ['S', ''],
        ['A', 'aA'],
        ['A', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-a-then-bb',
    type: 'PDA',
    title: 'Twice as many',
    goal: 'Accept the strings of some a s followed by exactly twice as many b s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 4,
    tests: ['', 'abb', 'aabbbb', 'a', 'ab', 'abbb', 'aabb', 'b', 'ba', 'abab', 'aab', 'bb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'b') === 2 * count(w, 'a'),
    theory:
      'The stack counts, and nothing says it has to count one for one. Push two marks for every a and the b s spend them one at a time, so the stack empties exactly when the second block is twice the first. A finite automaton cannot do this for the same reason it cannot do aⁿbⁿ.',
    hint: 'Reading an a should leave two marks behind. One state cannot push twice at once, so send the machine through a second state that pushes the other mark on an empty move.',
    setBuilder: 'L = { aⁿb²ⁿ : n ≥ 0 }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSbb'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-a2n-bn',
    type: 'PDA',
    title: 'Half as many',
    goal: 'Accept the strings of some a s followed by exactly half as many b s.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 4,
    tests: ['', 'aab', 'aaaabb', 'a', 'ab', 'aaab', 'aabb', 'b', 'ba', 'abab', 'aa', 'aaaab'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') === 2 * count(w, 'b'),
    theory:
      'The mirror of the level before last: there the machine pushed two marks per symbol, here it pushes one mark per two. Either way the stack is a counter with a scale factor, and the scale is set by how many states the machine walks through per symbol read.',
    hint: 'Read two a s to push one mark, which means passing through a second state and back. Then spend a mark per b.',
    setBuilder: 'L = { a²ⁿbⁿ : n ≥ 0 }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aaSb'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-anbn-cm',
    type: 'PDA',
    title: 'One pair, then anything',
    goal: 'Accept equal numbers of a s and b s, followed by any number of c s.',
    alphabet: ['a', 'b', 'c'],
    stackAlphabet: [STACK_BOTTOM, 'A'],
    par: 3,
    tests: ['', 'ab', 'abc', 'aabbcc', 'abccc', 'c', 'a', 'b', 'abbc', 'aabc', 'ba', 'acb'],
    accepts: (w) => /^a*b*c*$/.test(w) && count(w, 'a') === count(w, 'b'),
    theory:
      'One stack matches one pair, and once it has been spent it is spent. The c s are free because nothing has to be counted against them; ask for aⁿbⁿcⁿ instead and the same machine has nothing left to count with, which is the wall the last group of levels is built on.',
    hint: 'Push on a, pop on b, and once the bottom of the stack is showing, move to an accepting state that reads c s for as long as they keep coming.',
    setBuilder: 'L = { aⁿbⁿcᵐ : n ≥ 0, m ≥ 0 }',
    grammar: g(
      ['S', 'A', 'B'],
      ['a', 'b', 'c'],
      [
        ['S', 'AB'],
        ['A', 'aAb'],
        ['A', ''],
        ['B', 'cB'],
        ['B', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-two-brackets',
    type: 'PDA',
    title: 'Two kinds of bracket',
    goal: 'Accept the strings where round and square brackets are both balanced and properly nested.',
    alphabet: ['(', ')', '[', ']'],
    stackAlphabet: [STACK_BOTTOM, 'P', 'Q'],
    par: 2,
    tests: ['', '()', '[]', '()[]', '([])', '[()]', '(())', '(]', '[)', '([)]', '(', ')]'],
    accepts: (w) => {
      const stack: string[] = [];
      for (const c of w) {
        if (c === '(' || c === '[') stack.push(c);
        else if (stack.pop() !== (c === ')' ? '(' : '[')) return false;
      }
      return stack.length === 0;
    },
    theory:
      'Counting is no longer enough: ( [ ) ] has the right number of each and is still wrong. What matters is the order things were opened in, and the stack keeps that order for free, because the only thing it will ever give back is the most recent one.',
    hint: 'Two marks, one per kind of bracket. An opener pushes its own mark, a closer pops it, and a closer that meets the wrong mark has nowhere to go.',
    setBuilder: 'L = the properly nested strings over { (, ), [, ] }',
    grammar: g(
      ['S'],
      ['(', ')', '[', ']'],
      [
        ['S', '(S)S'],
        ['S', '[S]S'],
        ['S', ''],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-equal-ab',
    type: 'PDA',
    title: 'Equal counts, any order',
    goal: 'Accept the strings with equally many a s and b s, in any order.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A', 'B'],
    par: 2,
    tests: ['', 'ab', 'ba', 'aabb', 'abab', 'abba', 'baab', 'bbaa', 'a', 'b', 'aab', 'abb'],
    accepts: (w) => count(w, 'a') === count(w, 'b'),
    theory:
      'Here the stack is a counter that has to run in both directions, because the string may go ahead on either letter. Keep marks for whichever letter is currently in surplus: an a either cancels a waiting b or leaves a mark of its own, and the surplus can only ever be of one kind at a time.',
    hint: 'One state does all the reading. Four rules: a cancels a b mark or pushes an a mark, and b cancels an a mark or pushes a b mark. Leave for the accepting state only by popping the bottom of the stack, which is the same as saying nothing is outstanding.',
    setBuilder: 'L = { w ∈ {a,b}* : |w|ₐ = |w|_b }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSbS'],
        ['S', 'bSaS'],
        ['S', ''],
      ],
      'Every such string splits after its first matching partner, which is what the two symmetric rules say.',
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-wcw',
    type: 'PDA',
    title: 'Marked middle',
    goal: 'Accept a string, then c, then the same string backwards.',
    alphabet: ['a', 'b', 'c'],
    stackAlphabet: [STACK_BOTTOM, 'A', 'B'],
    par: 3,
    tests: ['c', 'aca', 'bcb', 'abcba', 'aabcbaa', 'bacab', '', 'ac', 'abc', 'acb', 'abcab', 'cc'],
    accepts: (w) => {
      const i = w.indexOf('c');
      if (i < 0 || w.indexOf('c', i + 1) >= 0) return false;
      return w.slice(0, i) === [...w.slice(i + 1)].reverse().join('');
    },
    theory:
      'The same shape as the mirror level, with one difference that changes everything: the c says where the middle is, so the machine never has to guess. This one is deterministic, and the mirror level is provably not, which is the first place the two kinds of pushdown automaton come apart.',
    hint: 'Push every symbol until the c, then pop one per symbol, checking each pop matches what was read. Leave for the accepting state by popping the bottom of the stack.',
    setBuilder: 'L = { w c wᴿ : w ∈ {a,b}* }',
    grammar: g(
      ['S'],
      ['a', 'b', 'c'],
      [
        ['S', 'aSa'],
        ['S', 'bSb'],
        ['S', 'c'],
      ],
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'pda-palindrome',
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
    setBuilder: 'L = { w w^R : w ∈ {a,b}* }',
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
  {
    id: 'pda-odd-palindrome',
    type: 'PDA',
    title: 'Odd mirror',
    goal: 'Accept the odd length strings that read the same backwards.',
    alphabet: ['a', 'b'],
    stackAlphabet: [STACK_BOTTOM, 'A', 'B'],
    par: 3,
    tests: ['a', 'b', 'aba', 'bab', 'aaa', 'ababa', '', 'ab', 'aa', 'abba', 'abab', 'aab'],
    accepts: (w) => w.length % 2 === 1 && w === [...w].reverse().join(''),
    theory:
      'The mirror level guessed where the middle was and jumped across it. Here the middle is a symbol rather than a gap, so the machine guesses the same way but eats one symbol on the way through and never checks what it was. That single unchecked symbol is the whole difference between the two languages.',
    hint: 'Push everything, then on some symbol move across to the popping half without pushing or popping anything, then pop one per symbol matching what is read.',
    setBuilder: 'L = { w ∈ {a,b}* : w = wᴿ and |w| is odd }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSa'],
        ['S', 'bSb'],
        ['S', 'a'],
        ['S', 'b'],
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
    type: 'TM',
    title: 'Cross off',
    goal: 'Accept a^nb^n again, this time on a tape you can rewrite.',
    alphabet: ['a', 'b'],
    tapeAlphabet: ['a', 'b', 'X', 'Y', BLANK],
    par: 5,
    tests: ['', 'ab', 'aabb', 'aaabbb', 'a', 'b', 'ba', 'abb', 'aab', 'aba', 'aabbb', 'aaabb'],
    accepts: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    theory:
      'A tape can be read and written in any order, so a Turing machine can mark cells and come back. Marking one a and one b at a time and sweeping back is the basic idiom of every tape algorithm.',
    hint: 'Cross the leftmost a as X, walk right past a s and Y s to the first b, cross it as Y, walk back left to the X, and repeat. When no a s remain, check that only Y s stand between you and the blank.',
    setBuilder: 'L = { a^nb^n : n ≥ 0 }',
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
    id: 'tm-equal-ab',
    type: 'TM',
    title: 'Cross off a pair',
    goal: 'Accept the strings with equally many a s and b s, in any order.',
    alphabet: ['a', 'b'],
    tapeAlphabet: ['a', 'b', 'X', BLANK],
    par: 6,
    tests: ['', 'ab', 'ba', 'aabb', 'abab', 'abba', 'baab', 'a', 'b', 'aab', 'abb', 'aaab'],
    accepts: (w) => count(w, 'a') === count(w, 'b'),
    theory:
      'A stack did this by holding whichever letter was in surplus. A tape does it by pairing them off: find an a, cross it out, find a b, cross that out, and start again. When no a is left the tape must be nothing but crossings, and the walk back that checks it is the part a stack could never do.',
    hint: 'Five states and a loop between them: find an a and cross it, return to the left end, find a b and cross it, return to the left end. When there is no a to find, walk once more and accept only if nothing but crossings remains.',
    setBuilder: 'L = { w ∈ {a,b}* : |w|ₐ = |w|_b }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSbS'],
        ['S', 'bSaS'],
        ['S', ''],
      ],
      'Context free, which is why level 27 can do it with a stack. The tape is a second way, not a stronger one.',
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'tm-palindrome',
    type: 'TM',
    title: 'Reads the same backwards',
    goal: 'Accept the strings that read the same forwards and backwards.',
    alphabet: ['a', 'b'],
    tapeAlphabet: ['a', 'b', 'X', BLANK],
    par: 7,
    tests: ['', 'a', 'b', 'aa', 'aba', 'abba', 'baab', 'ab', 'ba', 'abb', 'baba', 'aab'],
    accepts: (w) => w === [...w].reverse().join(''),
    theory:
      'A stack could only do the even length half of this by guessing where the middle was. A tape does not have to guess: it can walk to the far end, come back, and walk out again, which is exactly the movement a stack cannot make. The head crossing the string over and over is the whole difference.',
    hint: 'Cross off the first symbol, remember which one it was in the state, run to the far end and check the last uncrossed symbol matches, cross that off too, then walk back. Finishing on your own crossing off is an odd length string, and it still counts.',
    setBuilder: 'L = { w ∈ {a,b}* : w = wᴿ }',
    grammar: g(
      ['S'],
      ['a', 'b'],
      [
        ['S', 'aSa'],
        ['S', 'bSb'],
        ['S', 'a'],
        ['S', 'b'],
        ['S', ''],
      ],
      'Context free, which is why level 18 could do the even length half of it with a stack.',
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'tm-not-palindrome',
    type: 'TM',
    title: 'Everything but',
    goal: 'Accept the strings that do not read the same backwards.',
    alphabet: ['a', 'b'],
    tapeAlphabet: ['a', 'b', 'X', BLANK],
    par: 7,
    tests: ['ab', 'ba', 'abb', 'baa', 'aab', 'abab', '', 'a', 'b', 'aa', 'aba', 'abba'],
    accepts: (w) => w !== [...w].reverse().join(''),
    theory:
      'The same machine as the level before, with accept and reject swapped: it accepts on the first mismatch and rejects when the ends run out having matched. Swapping the two is only sound because this machine always halts. A machine that could run forever has no complement to swap into, and that is the difference between deciding a language and merely recognising it.',
    hint: 'Take the previous machine and move the accepting state. A mismatch between the two ends is now the good news, and running out of symbols with everything matched is the bad news.',
    setBuilder: 'L = { w ∈ {a,b}* : w ≠ wᴿ }',
    grammar: g(
      ['S', 'T'],
      ['a', 'b'],
      [
        ['S', 'aSa'],
        ['S', 'bSb'],
        ['S', 'aTb'],
        ['S', 'bTa'],
        ['T', 'aT'],
        ['T', 'bT'],
        ['T', ''],
      ],
      'Peel off matching pairs until the two ends disagree, which is what T sits between. Context free, and so is its complement here, which is not true of context free languages in general.',
    ),
    chomsky: 2,
    exhaustiveMaxLength: 6,
  },
  {
    id: 'tm-an-bn-cn',
    type: 'TM',
    title: 'Beyond context free',
    goal: 'Accept a^nb^nc^n: equal runs of a, b and c in that order.',
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
    setBuilder: 'L = { a^nb^nc^n : n ≥ 0 }',
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
  {
    id: 'tm-abcd',
    type: 'TM',
    title: 'Four blocks',
    goal: 'Accept some a s, then as many b s, then as many c s, then as many d s.',
    alphabet: ['a', 'b', 'c', 'd'],
    tapeAlphabet: ['a', 'b', 'c', 'd', 'X', 'Y', 'Z', 'W', BLANK],
    par: 7,
    tests: ['', 'abcd', 'aabbccdd', 'a', 'ab', 'abc', 'abcdd', 'aabbccd', 'abdc', 'dcba', 'abbcd', 'aabbcd'],
    accepts: (w) => {
      const m = /^(a*)(b*)(c*)(d*)$/.exec(w);
      if (!m) return false;
      const n = m.slice(1).map((part) => part.length);
      return n.every((k) => k === n[0]);
    },
    theory:
      'One more block than the level that was already beyond context free, and the machine barely changes: another marker, another sweep. That is the point of the last group. Where the earlier classes needed a new machine for every new kind of counting, the tape needs only another lap.',
    hint: 'One marker per letter. Cross the leftmost a, run right crossing the leftmost b, then c, then d, walk all the way back, and start again. When the a s are gone, everything to the right must already be crossed.',
    setBuilder: 'L = { aⁿbⁿcⁿdⁿ : n ≥ 0 }',
    grammar: g(
      ['S', 'B', 'C', 'D'],
      ['a', 'b', 'c', 'd'],
      [
        ['S', ''],
        ['S', 'aBCD'],
        ['S', 'aSBCD'],
        ['CB', 'BC'],
        ['DB', 'BD'],
        ['DC', 'CD'],
        ['aB', 'ab'],
        ['bB', 'bb'],
        ['bC', 'bc'],
        ['cC', 'cc'],
        ['cD', 'cd'],
        ['dD', 'dd'],
      ],
      'Context sensitive, like aⁿbⁿcⁿ, and built the same way: make n of each marker, sort them into blocks, then turn them into letters from the left.',
    ),
    chomsky: 1,
    exhaustiveMaxLength: 8,
  },

];

export const LEVELS: Level[] = CAMPAIGN.map((level, i) => ({ ...level, index: i + 1 }));

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
