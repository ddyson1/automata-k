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

  {
    id: 'dfa-div-by-three',
    index: 5,
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
    id: 'dfa-even-both',
    index: 6,
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
    id: 'dfa-same-ends',
    index: 7,
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
    index: 8,
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
    id: 'nfa-abc-blocks',
    index: 9,
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
    id: 'nfa-ends-ab-or-ba',
    index: 10,
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
    index: 11,
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
    id: 'nfa-two-or-three',
    index: 12,
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
    index: 13,
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
    index: 14,
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
    id: 'pda-a-then-bb',
    index: 15,
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
    id: 'pda-two-brackets',
    index: 16,
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
    index: 17,
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
    id: 'pda-palindrome',
    index: 18,
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

  // -------------------------------------------------------------------------
  // Turing machines
  // -------------------------------------------------------------------------
  {
    id: 'tm-an-bn',
    index: 19,
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
    id: 'tm-palindrome',
    index: 20,
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
    id: 'tm-an-bn-cn',
    index: 21,
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
