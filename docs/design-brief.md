# A design brief for automata-k

Paste everything below the rule into Claude to get UI/UX work on this app. It is
written to be handed over whole: it carries the subject, the design system that
already exists, the constraints that are not negotiable, the decisions already
made and why, and — the part that actually matters — the problems that are still
open.

Every number in it was measured from the shipping build rather than estimated.
When the app changes, change this too, or it will start lying.

---

## The work

You are designing the interface for **automata-k**, a puzzle game for formal
language theory. It ships as a web app at automata-k.org, and a native iOS port
exists in `ios/`. Forty two levels climb the Chomsky hierarchy.

**The core loop.** A level states a language in plain English — *"Accept exactly
the strings that end with 1"* — and lists strings that must be accepted and
strings that must be rejected. The player draws a machine on a canvas: circles
for states, arrows for transitions, one start marker, any number of accepting
markers. They press Run. Every listed string is fed through their machine and
each one gets a tick or a cross.

**The thing that makes it different from a quiz.** Nothing anywhere stores an
expected answer. Each level carries a predicate, and the player's machine is
graded against the *language*, not against a stored solution. Any correct
machine passes, including ones nobody anticipated. The two lists of strings are
not a hint or a score — they are the grader, made visible. Design as if that
distinction is the point, because it is.

**Four machine classes, and each one draws differently.**

| Class | Levels | An arrow carries | The memory it has |
|---|---|---|---|
| DFA | 14 | one symbol to read | the state it is in, and nothing else |
| NFA | 10 | a symbol, possibly epsilon | the same, but it may be in several at once |
| PDA | 12 | read, pop, push | one unbounded stack |
| TM | 6 | read, write, move L or R | a tape it can rewrite and walk both ways |

A player can also step any string through their machine and watch it run: the
live state set lights up, the read head advances, and the stack or tape is drawn
alongside.

## Who plays it

Someone learning this material — an undergraduate on a theory of computation
course, or a person working through it alone. They know what a set is. They may
be meeting a pushdown automaton for the first time. They are as likely to be on
a phone on a bus as at a desk.

The app is also a teaching surface: alongside the canvas there are five panes —
the brief, the machine as a formal tuple with its transition function, theory
that explains each letter of that tuple in plain words, analyses (minimality,
the subset construction, a regular expression), and a hint.

## The design system that already exists

This is not a blank page. Match it. Deviate only where you can say why.

**Palette** — Mist and Dusk, one world in two lights. Mist is the light theme,
a cool pale ground with a little haze in it. Dusk is the dark one, slate rather
than black, so the machine has something to glow against. Colour has exactly two
jobs: energy marks the machine doing something, and pass and fail carry the
verdict. Nothing else is coloured.

```
                 Mist       Dusk
ground          #eef1f5   #3f4859    the page
ground-top      #f4f6f9   #525d71    the canvas fades from this...
ground-bottom   #e3e8ef   #313848    ...to this, top to bottom
surface         #fbfcfe   #394253    panels, chips, states
sunken          #e7ebf1   #333b4b    the pressed and the tinted
ink             #17202b   #eef2f8    text, strokes, selection
ink-soft        #364152   #d2d8e1
muted           #5a6577   #a8b1c0
faint           #8a94a3   #8892a3
hairline        #d9dee6   #535c6c    the everyday rule
rule            #b7bfcb   #6a7384    the emphatic one
energy          #2a54f5   #a8d6ff    the machine running: live state, read head, lit rule
pass            #13824b   #95e4b0    a string your machine agrees with
fail            #b83a20   #ffa48e    one it does not
```

Radii: 5px on a chip, 8px on a control, 16px on a sheet. Tap target 44px.

**Type** — one face. Everything is Martian Mono, a terminal typeface, pinned at
width 100: the question, the prose, the notation, the labels. It has no Greek
and no mathematical operators, so JetBrains Mono supplies exactly those glyphs
under the same family name, scaled to Martian Mono's x-height so that δ(q0, a)
reads as one line of type.

The old rule was that anything formal is monospaced, to signal "this is
mathematics" without saying so. Now everything is, and the signal is the whole
voice: this is a machine, and you are programming it.

Sizes are set by x-height rather than by number. Martian Mono's x-height is
0.6em, so every role sits a little smaller in pixels than a proportional face
would.

**Marks** — structure comes from hairlines and from space; the canvas carries
a faint vertical gradient. A state is a circle with a rim, not a filled disc,
and an accepting state is a double rim. States are the one thing with depth: on
Mist a state casts a soft shadow, and on Dusk it gives off a little light, since
a dark ground can take light where a pale one cannot. The state a trace is in
fills with energy and grows a halo, and that is the one filled state you will
ever see. A rule being used is a pulse of energy running along its arrow.

**Rules read out** — every rule can be said in plain words: *read ( · put X
on top · stay in q0*. Hovering or focusing a rule's chip says it, the trace says
it as each rule fires, and the rule editor says it as the player picks. Pushdown
and Turing levels carry a one-line key to their notation in the brief.

## Constraints that are not negotiable

- **No network calls at all.** No accounts, no analytics, no ads, no remote
  fonts, no telemetry. Progress lives on the device. Any design that needs a
  server is out.
- **Both themes, equally.** Not an inverted afterthought.
- **44px minimum touch target**, everywhere.
- **The canvas is the app.** Anything else on screen has to earn its pixels
  against the machine being drawn.
- **The grader is the brief.** There is no score band, no percentage, no stars.
  The lists of strings change as the verdict changes, and that is the feedback.
  A passing run ends on one card saying what the theory says of the machine's
  size: a DFA has exactly one minimal machine, so the card says whether yours is
  it; finding a minimal NFA is PSPACE-hard and for pushdown and Turing machines
  it is undecidable, so there it says that par is only the best found. There is
  no leaderboard or histogram to rank against, because that would need a server.

## Decisions already made, with the reasoning

Do not relitigate these without a better argument. Each replaced something worse.

**Grading happens on a press, not on every edit.** Live grading is honest but
has no moment in it: the answer arrives while you are still mid-thought. On a
press there is something to press, something to wait for, and something to hear.
Every mark reverts to a neutral dot the instant the machine stops being the one
that was run — a tick that might no longer be true is worse than no tick.

**A level is a chamber, not a page beside a canvas.** The whole window is one
lit volume. The question floats in the top left and the instruments in the top
right, written on the air; the console is glass on the right, so the machine
shows through it; the readout runs along the foot. A pushdown machine's stack
is architecture, standing on the stage beside the machine, not a row in a
panel. The suite is played through the machine when it runs, string by string,
because a verdict you watched happen teaches more than ticks that appeared.

**On a phone the question stays at the top and the console is a bar at the
bottom.** An earlier sheet across the bottom was asked to be a verdict, a way
into five tabs, and out of the way, and half-did each: 30% of the screen while
drawing, and 57% once the trace transport stacked on it. Its replacement put
the question in a rail across the top, which the chamber keeps; the console's
bar carries only the verdict and Run, and opens over the chamber for the rest.

**Actions live in the thumb's arc.** Run bottom right; undo, redo, tidy and fit
bottom left. Reading material is at the top, where reaching does not matter.

**Icon-only controls draw their own labels.** The browser's `title` tooltip is
not used: about a second of delay, unstyleable, and absent entirely on touch.
Labels appear on hover and on keyboard focus, and flash for 1.5s after a press
where there is no hover. An icon is judged on being distinct from the three
sitting beside it, not on being guessable alone.

**Home is the climb, not a list.** The four groups of the old list were the
hierarchy; now they are drawn as one: four floors, finite at the bottom, with
the levels as stops on a path up. The stops are still the level buttons, in
order and labelled, so nothing about reaching a level by keyboard or screen
reader got worse. Energy marks only the next level. A panel describes the
pointed-at stop; on a phone it is pinned under the thumb.

**Each new kind of machine arrives with a crossing.** Going from finite to
pushdown is the most important step in the hierarchy, and it should feel like
one. A crossing is short, plays once, can be skipped from its first frame, and
never plays on a link from outside the game, because a shared link means "show
me this level". With reduced motion it is the same scene, shown all at once.

**Every level opens on a blank canvas.** What you draw lives for the session and
no longer. Arriving at a level and finding a machine from a sitting you no longer
remember is indistinguishable from a puzzle that came half solved. Progress —
which levels are solved, in how many states — does persist.

## What is genuinely unsolved

This is the actual ask. A general redesign is not wanted; these are.

1. **Portrait layout for a machine.** The layout engine ranks states left to
   right into columns, which is a landscape habit. A six-state chain runs off
   both edges of a 390px screen. Does the layout turn vertical in portrait? Does
   the canvas pan and the player accept that? Does the diagram reflow per
   orientation, and if so what happens to hand-placed coordinates?

2. **Drawing an arrow with a finger.** On a pointer device you hover a state,
   four grips appear on its rim, and you drag one to another state. Touch has no
   hover, so the grips have nowhere to come from. This is the single most
   important gesture in the app and it currently has no touch-native answer.

3. **Writing a rule on a small screen.** A DFA arrow needs one field. A PDA
   arrow needs three, a TM arrow needs three including a direction. Today this
   is a sheet of segmented pickers. It is functional and it is dull, and it is
   the screen a player sees most often after the canvas.

4. **Density on the hardest levels.** Chip stacks are now placed together, so
   none lands on another or on a state in any reference machine. On the
   densest Turing levels at phone width a few still lie across a line or sit a
   little off their arrow, because there is no open ground left; the answer
   there is probably layout, not labels.

5. **Teaching the interaction.** Three lessons now come before level 1, on a
   Learn floor under the finite one: watch a machine read, choose where it says
   yes, draw the arrow it is missing. A coach under the question says one thing
   at a time and moves on when it has happened, and each lesson leaves on only
   the tools it is about. Still open: lessons 4 to 6 (states as memory, placing
   your own states, dead states), and whether the first ninety seconds should
   open straight into lesson 1 rather than the climb pointing at it.

6. **The shape of forty two levels.** Fourteen DFA, ten NFA, twelve PDA, six TM,
   unlocking in order. The list says which are solved and in how many states
   against par. It does not convey an arc, or that crossing from NFA to PDA is
   the moment the machine gains memory — which is the most important idea in the
   whole hierarchy.

7. **If this becomes a native iOS app**: what should be native rather than
   merely ported? Pencil support on the canvas, haptics on a verdict, a widget,
   handoff between phone and iPad. And what should stay exactly as it is, because
   it is already right.

## What to produce

Work in this order, and stop after the first for feedback.

1. **Pick the problems.** Say which of the seven above you are taking and why,
   and name any you think are misframed. This step is not optional; a design
   that answers all seven at once will answer none of them.
2. **Show, at real device size.** 390×664 for a phone, 1280×900 for a desktop.
   Both themes. Screens that are honest about how much room the machine is left,
   with the number stated.
3. **State each trade.** Every direction costs something. Name it rather than
   let it be discovered later.
4. **Write the copy.** Button labels, empty states, error text. In this app the
   words are design material — "Nothing drawn yet", "Shortest disagreement: 1,
   which should be accepted" — and they carry as much of the teaching as the
   layout does.

Static mockups are fine. Interactive ones at real device size are better,
because the trade in this app is almost always about screen budget, and a
picture will let you cheat about it.
