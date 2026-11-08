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

**Marks** — no shadows. Structure comes from hairlines and from space; the
canvas carries a faint vertical gradient and nothing else does. A state is a
circle with a hairline rim, not a filled disc; an accepting state is a double
rim; the state a trace is in fills with energy, and that is the one filled
state you will ever see.

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

## Decisions already made, with the reasoning

Do not relitigate these without a better argument. Each replaced something worse.

**Grading happens on a press, not on every edit.** Live grading is honest but
has no moment in it: the answer arrives while you are still mid-thought. On a
press there is something to press, something to wait for, and something to hear.
Every mark reverts to a neutral dot the instant the machine stops being the one
that was run — a tick that might no longer be true is worse than no tick.

**On a phone the brief is a rail across the top, not a sheet across the bottom.**
The sheet was asked to be a verdict, a way into five tabs, and out of the way,
and half-did each. Measured on a 390×664 viewport: the old sheet took 30% of the
screen while you were only drawing, left 212px of machine when opened, and
stacked with the trace transport to cover 57%. The rail carries the question
itself — which the sheet never had room for — and costs 23% while drawing, 29%
once there is a verdict, 33% during a trace. Tapping it anywhere opens the five
panes full screen.

**Actions live in the thumb's arc.** Run bottom right; undo, redo, tidy and fit
bottom left. Reading material is at the top, where reaching does not matter.

**Icon-only controls draw their own labels.** The browser's `title` tooltip is
not used: about a second of delay, unstyleable, and absent entirely on touch.
Labels appear on hover and on keyboard focus, and flash for 1.5s after a press
where there is no hover. An icon is judged on being distinct from the three
sitting beside it, not on being guessable alone.

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

4. **Density on the hardest levels.** Where three arrows converge, their symbol
   chips overlap. State spacing is solved; chip placement is not.

5. **Teaching the interaction.** Level 1 hands you an empty canvas and a
   sentence. Nothing teaches double-tap-to-place or drag-from-a-rim except a
   line of grey text. What is the first ninety seconds?

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
