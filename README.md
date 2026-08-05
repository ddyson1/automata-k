# automata-k

A puzzle game for formal language theory. You draw a machine on a canvas and
the app grades it by running that machine against a fixed suite of test
strings. Twelve levels climb the Chomsky hierarchy: deterministic finite
automata, nondeterministic finite automata with empty moves, pushdown
automata, then Turing machines.

Alongside the diagram the app shows the same machine as a formal object, so the
tuple and the transition function update as you build.

Two native apps, one engine. The web app is plain TypeScript against the DOM
and SVG; the iOS app is SwiftUI. The engine is ported rather than shared, and
the port is held to a fixture generated from the proven one.

## Running it

```
npm install
npm run dev          # the web app, on a dev server
npm run build        # web/dist, a folder of static files
npm run build:single # web/dist/automata-k.html, one file, opens with file://
```

The built app works from any path a host serves it from, makes no network
requests, and keeps progress in localStorage.

## Publishing it

`.github/workflows/pages.yml` builds `web/dist` and publishes it to GitHub
Pages on every push to `main`, after the full check has passed. The site needs
enabling once by hand: **Settings, then Pages, then set Source to "GitHub
Actions"**. Nothing in the workflow can do that for you, and until it is done
the deploy step fails with "Get Pages site failed".

Nothing else is needed. Assets are built with `base: './'` so every URL is
relative and a project page at `/<repo>/` works exactly like a domain root, and
routing is by hash so no request ever reaches the server for a path it does not
already have a file for. The deploy also publishes `automata-k.html`, the whole
game in one file, next to the site.

`.github/workflows/ci.yml` runs the same check on every other branch and every
pull request. Both call `verify.yml`, so there is one definition of what passing
means.

For iOS, `ios/` is a Swift package containing the engine. See `ios/README.md`,
including what has and has not been executed.

## Verifying it

```
npm test           # engine, grammar, geometry and purity suites
npm run typecheck  # tsc --noEmit, strict, on both projects
npm run test:web   # Playwright, desktop and phone viewports
npm run check:swift  # the golden fixture against the Swift declarations
npm run verify     # all of the above
```

Two checks are the definition of done, and both print their counts.

**9.1 Engine and solutions.** Every level's verified solution is run against
its own test suite and against every string over its alphabet up to length 6,
length 9 for a^n b^n c^n, and compared to the level's `accepts` predicate.
Nothing anywhere hardcodes a pass or fail for a particular string. The suite
also asserts each solution's state count equals par and that every state sits
inside the canvas.

**9.2 Grammars.** Every grammar in the formal layer is derived by
breadth-first search over sentential forms with a length cap, and the
generated set is asserted equal to the level's language over the same range.
A single wrong production shows up immediately, including in the context
sensitive grammar for a^n b^n c^n.

Alongside those: validation tests, simulation cap tests, a property test
determinising random NFAs, Hopcroft minimisation against par, state
elimination checked against every level language, and 36 Playwright tests over
two viewports.

## Layout

```
/src
  /engine        pure TypeScript, zero platform imports
    types.ts     Machine, Transition, Level, Frame, RunResult, caps
    simulate.ts  simulateDFA / simulateNFA / simulatePDA / simulateTM / run
    validate.ts  well-formedness per machine class
    minimize.ts  Hopcroft, reachability, completion, subset construction
    regex.ts     state elimination
    levels.ts    the twelve levels, each with an accepts predicate
    solutions.ts one verified machine per level
    formal.ts    tuple rendering, delta notation, grammars, hierarchy copy
  /ui
    geometry.ts  edge geometry, shared by the web app and its tests
/web             the web app: DOM and SVG, no framework
  /src
    brief.ts     the question, the two lists, and the live marks
    diagram.ts   the canvas
    overlay.ts   the formal layer, over the brief
    ledger.ts    tuple and transition function
    theory.ts    grammar, hierarchy, class, and the hint
    trace.ts     the stepper
    fonts/       the three bundled families, subset from the originals
/ios             the Swift package: the same engine, held to a golden fixture
/scripts         golden fixture, font build, single file build, shape check
/tests           the verification suites, plain Node
/e2e             Playwright web tests
```

The engine is importable by a plain Node script and `tests/purity.test.ts`
keeps it that way: it fails if anything under `src/engine` imports a UI
framework or touches a platform global.

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

## Interface

Two things are on screen: the brief, and the canvas.

**The brief is the puzzle and the grader at once.** The question in plain
English, the language under it, and then the two lists that actually define the
level: these must be accepted, these must be rejected. Those lists are the
grader. A tick appears beside a string the moment the machine agrees with it, so
there is no results band to read and no score to translate into a diagnosis.
When it fails it names the shortest string the machine and the language disagree
on. Tapping a string runs it.

**The canvas has no dock, and it is the whole right side of the window.** A
state is placed by double clicking. Dragging inside a state moves it; dragging
from the band just outside it pulls an arrow, and the state under the pointer
grows four grips that say so. The state you would land on lights up while you
drag. A state's own controls appear attached to it when it is selected, and an
empty canvas says what to do in the middle of itself.

Four quiet icons in one corner do the things with nothing to attach to: undo,
redo, tidy, fit. Everything formal is one disclosure away: **The machine** slides
a panel over the brief with the tuple, δ, the theory and the analyses. Pointing
at a rule lights the arrow it came from; selecting an arrow lights its rule.

On a phone the canvas is the screen and the brief is a sheet that peeks, showing
the verdict, and pulls up for the lists. Anything that turns attention to the
machine, taking the worked solution or starting a trace, drops it back to
peeking.

## Design

Ink: achromatic, hairline rules, no fills, no shadows. Structure comes from
rules and space. Pass and fail are the only colour in the app, and they are
quiet; a machine that works should feel settled, not congratulated.

Literata for level titles, Inter for interface text, JetBrains Mono for
anything that is machine notation. All three are bundled, all three are under
the SIL Open Font License, and `scripts/build-fonts.py` cuts each one from the
complete original down to the ranges the app can draw. 189KB, and δ, ε, Σ and
the set-theory symbols are drawn by the typeface rather than by whatever the
system happened to have.

Exponents are written `^n`, not with Unicode superscript codepoints. The type
study measured every non-ASCII character the app shows against nine families
and found the superscripts carried by none of them, so both renderers raise
`^x` themselves.

## Rendering

Two things the diagram gets right on purpose.

**Arrows.** No SVG markers. Each head is a filled triangle placed at the
curve's tangent so it lands on the target circle with about 3px clearance, at
any angle, distance or bend, and the stroke stops a fixed distance back along
the curve from that tip rather than a fixed distance from the target, which is
only the same thing on a straight edge. Every edge has a slight bend by default and a
wider one when a reverse edge exists, so parallel arrows separate. Self loops
are true circular arcs aimed away from the average direction of that state's
other connections, and away from a near canvas edge so their labels stay on the
card. Several transitions on one pair stack as separate rounded chips.

**Drag.** A drag never commits a position per frame. It writes transforms
straight onto the SVG nodes and recomputes the batched edge paths in place;
one commit lands on release, so one undo takes it back.

The canvas grows its visible region from the size of the window in pixels, so a
taller window shows more of the world rather than magnifying the same part of
it, and the grid runs edge to edge because the pane is the canvas. The logical
340 x 460 box is where authored solutions live and what the iOS port shares; on
screen it is only a starting frame, and a drag is bounded by what is visible.

## The Swift port

The TypeScript engine is the proven one. Rather than describe it twice,
`scripts/golden.ts` freezes the proof into `ios/Tests/.../golden.json`: every
level's shape, verified solution and grammar, plus the language itself as a
bitmap over the canonical enumeration of Σ* up to that level's depth, one bit
per string. 31887 bits across 12 levels. `tests/golden.test.ts` regenerates the
fixture and checks it against the live predicate string for string, so a stale
fixture cannot pass, and the Swift tests hold the port to the same bits.

No Swift toolchain is reachable from this environment, so none of the Swift has
been compiled. `npm run check:swift` is the mitigation available here: it
confirms the fixture's keys and enum values match the `Codable` declarations.
`swift test` on a Mac is the real proof.

## What is not built

Sections 10.5 to 10.7 of the brief are not implemented: share and import,
sandbox mode, and the level editor. Everything above them in that list is:
minimality feedback, the subset construction viewer, counterexamples on
failure, the regular expression view, dark mode and the accessibility pass.

The SwiftUI app itself is not written yet. `ios/` currently contains the engine
and its tests, which is the part that has to be right before any of it is worth
drawing.

## Provenance

The build brief referenced a prototype at `/reference/prototype.jsx` as the
behavioural specification. That file was not present in this repository, so
the twelve levels, their verified solutions and the formal-layer copy are
authored to the written spec instead, and proved correct by the suites above.
`levels.ts`, `solutions.ts` and `formal.ts` are isolated, so dropping in the
original content is a contained change followed by a re-run of 9.1 and 9.2.

## Constraints kept

No account system, no analytics, no ads, no network calls. Progress stays on
device behind a single `storage.ts` interface. No paid dependencies. The whole
web app is five dev dependencies and no runtime ones.
