# AutomataEngine

The engine, in Swift. A plain library target with no UI dependency, so
`swift test` runs it with no simulator.

```
cd ios
swift test
```

## How this is kept honest

The TypeScript engine is the proven one. Sections 9.1 and 9.2 check every
level's verified solution against its `accepts` predicate over every string up
to the level's depth, and derive every grammar by breadth-first search over
sentential forms. That is 31,887 strings and 12 grammars, with zero mismatches.

Rather than port the predicate, which would be a second thing that can drift,
`scripts/golden.ts` freezes the result into `Tests/AutomataEngineTests/Fixtures/golden.json`:

- every level's shape, its verified solution and its grammar
- the language itself, as a bitmap over the canonical enumeration of Σ* up to
  the level's depth, one bit per string, in the order both engines build

`GoldenTests` then runs the Swift simulators over the same enumeration and
compares to the same bits. A green `swift test` means the Swift port agrees
with the proven TypeScript engine on all 31,887 strings, not that it agrees
with a second hand-written description of the same thing.

`GrammarTests` does the same for section 9.2, deriving each grammar in Swift
and comparing the generated set to the same bitmap. `EngineTests` mirrors the
validation and cap cases, so the two engines fail in the same places as well as
succeeding in the same places.

Regenerate the fixture after any level change:

```
npm test            # rewrites golden.json and checks it against the live engine
node scripts/check-swift-shape.mjs   # fixture keys still match the Codable structs
```

## What is here

```
Sources/AutomataEngine/
  Types.swift      Machine, Transition, Frame, RunResult, caps, canvas
  Validate.swift   well-formedness per machine class
  Simulate.swift   simulateDFA / simulateNFA / simulatePDA / simulateTM / run
  Grammar.swift    derivation by breadth-first search over sentential forms
  Golden.swift     the fixture, and the level data the app reads from it
Tests/AutomataEngineTests/
  GoldenTests.swift    section 9.1 in Swift
  GrammarTests.swift   section 9.2 in Swift
  EngineTests.swift    validation, caps and trace frames
  Fixtures/golden.json generated, do not edit
```

## Semantics

Identical to the TypeScript engine, because the fixture would catch it if not.

- Epsilon is a distinct symbol constant, never in an input alphabet. Blank is a
  distinct tape symbol.
- DFA: duplicate reads and empty moves are errors and are reported rather than
  simulated. A missing pair is a legal implicit dead state and its count is
  surfaced.
- NFA: epsilon closure plus subset simulation.
- PDA: stack starts `["$"]`, breadth-first over `(state, stack, position)`,
  40000 configurations and a stack height of `2n + 12`.
- TM: single tape infinite both ways, partial delta halts and rejects, accepts
  on entering an accepting state, 4000 steps then a non-halting result that is
  distinct from a rejection.
- Frames cap at 400; simulation always continues to the real limit.

## Status

Written but not yet executed. The environment this was authored in has no
Swift toolchain and no network route to one, so nothing here has been compiled.
The fixture and the shape check are the mitigation: `node scripts/check-swift-shape.mjs`
confirms the JSON matches the `Codable` declarations, and `swift test` on a Mac
is the real proof. Expect to fix compile errors on the first run.
