# automata-k for iOS

A SwiftUI app, and the engine it runs on.

```
cd ios
open App/AutomataK.xcodeproj     # the app
swift test                       # the engine, no simulator needed
python3 check-app.py             # the checks that do not need a compiler
```

The engine is a plain library with no UI dependency, so `swift test` runs it
against the golden fixture without a simulator. The app target compiles those
same sources directly rather than linking the package: no resolution step, no
`import AutomataEngine`, and one place where a symbol can be wrong.

`make-xcodeproj.py` generates the project from the file list. Hand-written
pbxproj rots the moment a file is added, so adding a source means adding a line
there and re-running it; the object ids are derived from the paths, so the diff
shows only what changed.

## The app

Direction A of the four drawn in `docs/design-brief.md`: the shipped web layout
worn as an app. A rail across the top carries which level this is, what it asks
in words and in set-builder, and the verdict once a run has happened; tapping it
opens the five panes full screen. Run docks bottom right, the four tools bottom
left, both in the thumb's arc.

One thing is native rather than ported. On the web a state reveals its drag
grips on hover, and a touch screen has no hover — that gesture was the single
part of the interface with no touch answer. Here **selection** reveals them: tap
a state and four grips appear on its rim and stay, so drawing an arrow is
drag-a-grip-to-a-state with nothing behind a pointer the device does not have.

Progress is `UserDefaults` and nothing else. What you draw lives for the session
and no longer, exactly as on the web. No account, no analytics, no network call
anywhere in the app.

## How this is kept honest

The TypeScript engine is the proven one. Sections 9.1 and 9.2 check every
level's verified solution against its `accepts` predicate over every string up
to the level's depth, and derive every grammar by breadth-first search over
sentential forms. That is 130,100 strings and 42 grammars, with zero mismatches.

Rather than port the predicate, which would be a second thing that can drift,
`scripts/golden.ts` freezes the result into `Tests/AutomataEngineTests/Fixtures/golden.json`:

- every level's shape, its verified solution and its grammar
- the language itself, as a bitmap over the canonical enumeration of Σ* up to
  the level's depth, one bit per string, in the order both engines build

`GoldenTests` then runs the Swift simulators over the same enumeration and
compares to the same bits. A green `swift test` means the Swift port agrees
with the proven TypeScript engine on all 130,100 strings, not that it agrees
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
  Layout.swift     Tidy: rank by breadth first search, one column per rank
  Golden.swift     the fixture, and the level data the app reads from it
App/AutomataK/
  AutomataKApp.swift   the entry point, and loading the fixture
  Theme.swift          the palette and the three type roles, from theme.css
  Store.swift          the canvas per level, undo and redo, and progress
  Views/Geometry.swift where the arrows go
  Views/DiagramView.swift   the canvas, and the grips that replace hover
  Views/LevelListView.swift the climb, grouped by machine class
  Views/LevelView.swift     the rail, the tools, Run, and grading on a press
  Views/PaneView.swift      brief, machine, theory, grammar, stuck
  Views/RuleEditorView.swift  one rule, with the fields that class has
  Views/TraceView.swift     stepping a string, with the stack or the tape
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

**Written but not yet executed.** The environment this was authored in has no
Swift toolchain and no network route to one — `download.swift.org` is refused by
the proxy, and Ubuntu's `swift` package is OpenStack's object store — so not one
line here has been through a compiler. Opening the project on a Mac is the first
real build, and it should be expected to turn up errors.

`check-app.py` exists to make that list short. It does the checks that do not
need a compiler: every engine symbol the app names is declared, every
`Type.member` the app writes exists on that type, braces balance in every file,
every source is actually in the Xcode target, every path the project references
is on disk, and the fixture carries the fields the views read. It has already
caught one real ambiguity and one symbol that was not where the app thought.

What else has been checked without a compiler, and holds as of 42 levels:

- `node scripts/check-swift-shape.mjs` — the fixture's keys match the `Codable`
  declarations. 42 levels, 130,100 strings, 503 tests.
- Every constant matches `src/engine/types.ts` exactly: epsilon, blank, the
  stack bottom, the canvas, and all four caps.
- The bitmap packs and unpacks the same way at both ends — `1 << (i & 7)`,
  little end first, in `scripts/golden.ts` and in `Golden.swift`.
- Nothing references a symbol that is not declared: `LevelShape` is in
  Validate.swift and `Simulator.enumerateStrings` is in Simulate.swift.

## What is not here

`minimize` and `regex` are not ported, so the Analysis pane — minimality, the
subset construction, a regular expression for what you drew — has no iOS
counterpart yet. Its tab is absent rather than empty.

`formal` is ported only as far as the app needs it: the tuple and δ are written
out in `PaneView`, the tutor cards that explain each letter in plain words are
not. `layout` is ported in full, so Tidy behaves identically on both.

There is no app icon, no launch screen art and no test target for the views.
