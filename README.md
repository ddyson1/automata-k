# Automata Lab

A puzzle game for formal language theory. You draw a machine on a canvas and
the app grades it by running that machine against a fixed suite of test
strings. Twelve levels climb the Chomsky hierarchy: deterministic finite
automata, nondeterministic finite automata with empty moves, pushdown
automata, then Turing machines.

Alongside the diagram the app shows the same machine as a formal object, so the
tuple and the transition function update as you build.

One codebase, iOS and web.

## Running it

```
npm install
npm run web        # Expo web
npm run ios        # Expo on a simulator or device
```

## Verifying it

```
npm test           # engine, grammar, geometry and purity suites
npm run typecheck  # tsc --noEmit, strict, no any in the engine
npm run build:web && npm run test:web   # Playwright, desktop and phone viewports
maestro test .maestro/smoke.yaml        # the iOS smoke flow, needs a simulator
```

Two checks are the definition of done, and both print their counts.

**9.1 Engine and solutions.** Every level's verified solution is run against
its own test suite and against every string over its alphabet up to length 6,
length 9 for aⁿbⁿcⁿ, and compared to the level's `accepts` predicate. Nothing
anywhere hardcodes a pass or fail for a particular string. The suite also
asserts each solution's state count equals par and that every state sits
inside the canvas.

**9.2 Grammars.** Every grammar in the formal layer is derived by
breadth-first search over sentential forms with a length cap, and the
generated set is asserted equal to the level's language over the same range.
A single wrong production shows up immediately, including in the context
sensitive grammar for aⁿbⁿcⁿ.

Alongside those: validation tests, simulation cap tests, a property test
determinising random NFAs, Hopcroft minimisation against par, and state
elimination checked against every level language.

## Layout

```
/src
  /engine        pure TypeScript, zero React and zero React Native imports
    types.ts     Machine, Transition, Level, Frame, RunResult, caps
    simulate.ts  simulateDFA / simulateNFA / simulatePDA / simulateTM / run
    validate.ts  well-formedness per machine class
    minimize.ts  Hopcroft, reachability, completion, subset construction
    regex.ts     state elimination
    levels.ts    the twelve levels, each with an accepts predicate
    solutions.ts one verified machine per level
    formal.ts    tuple rendering, delta notation, grammars, hierarchy copy
  /ui            screens, canvas, sheets, design tokens
  /store         game state and persistence
/app             expo-router routes
/tests           the verification suites, plain Node
/e2e             Playwright web smoke tests
/.maestro        the iOS smoke flow
```

The engine is importable by a plain Node script and `tests/purity.test.ts`
keeps it that way: it fails if anything under `src/engine` imports React,
React Native, Expo or Zustand, or touches a platform global.

## Engine semantics

Epsilon is a distinct symbol constant, never a member of an input alphabet.
Blank is a distinct tape symbol.

**DFA.** Two arrows from one state on the same symbol is a validation error,
and so is any empty move; both are reported rather than simulated. A missing
pair is allowed, behaves as an implicit dead state, and the count is surfaced.

**NFA.** Epsilon closure plus subset simulation. Accepts when the reachable set
meets F.

**PDA.** Stack starts as `["$"]`. A transition reads a symbol or epsilon, pops
one symbol or epsilon, and pushes one symbol or epsilon, the pushed symbol
landing on top. Acceptance is by final state with the whole input consumed.
Breadth-first search over `(state, stack, position)` with a visited set and a
parent map for the trace, capped at 40000 configurations and a stack height of
`2 * input.length + 12`.

**TM.** Single tape, infinite both ways, blank filled. Two arrows on one read
symbol is a validation error. δ is partial: no applicable transition halts and
rejects. Accepts the moment it enters an accepting state. Step limit 4000,
after which the run is reported as non-halting, distinct from a rejection.

Every simulator returns `{ accepted, frames, error?, note?, outcome }`. Frames
are capped at 400 but simulation always runs to the real limit.

## Rendering

Two things the diagram gets right on purpose.

**Arrows.** No SVG markers. Each head is a filled triangle placed at the
curve's tangent so it lands on the target circle with about 3px clearance, at
any angle, distance or bend. Every edge has a slight bend by default and a
wider one when a reverse edge exists, so parallel arrows separate. Self loops
aim away from the average direction of that state's other connections, and
away from a near canvas edge so their labels stay on the card. Several
transitions on one pair stack as separate rounded chips.

**Drag.** Positions never touch React state per frame. They live in one
Reanimated shared value; edge paths, arrow heads, node transforms and label
chips all derive from it on the UI thread, and one commit lands on release.
All edges batch into a single path per style, so a drag animates four
properties rather than one per arrow.

## What is not built

Sections 10.5 to 10.7 of the brief are not implemented: share and import,
sandbox mode, and the level editor. Everything above them in that list is:
minimality feedback, the subset construction viewer, counterexamples on
failure, the regular expression view, dark mode and the accessibility pass.

The iOS smoke flow is written but has not been executed here, because this
environment has no simulator. The web smoke tests run against the exported
static build on every check.

## Provenance

The build brief referenced a prototype at `/reference/prototype.jsx` as the
behavioural specification. That file was not present in this repository, so
the twelve levels, their verified solutions and the formal-layer copy are
authored to the written spec instead, and proved correct by the suites above.
`levels.ts`, `solutions.ts` and `formal.ts` are isolated, so dropping in the
original content is a contained change followed by a re-run of 9.1 and 9.2.

## Constraints kept

No account system, no analytics, no ads, no network calls. Progress stays on
device behind a single `storage.ts` interface, backed by `expo-sqlite/kv-store`
on both platforms. No paid dependencies. No native modules that need a config
plugin beyond what Expo ships.
