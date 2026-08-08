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
language theory. It ships as a web app and is being considered for a native iOS
port. Forty two levels climb the Chomsky hierarchy.

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

**Palette** — achromatic by decision, not by default. Colour appears only to
carry a verdict.

```
                 light      dark
ground          #f7f7f5   #141518    the canvas, the page
surface         #ffffff   #1a1c1f    panels, chips, states
sunken          #f1f1ee   #17181b    the pressed and the tinted
ink             #14161a   #eceae5    text, strokes, the accent
ink-soft        #34383e   #c9c7c2
muted           #6b6f76   #92959b
faint           #9a9ea4   #6a6d73
hairline        #e4e4e0   #2b2d31    the everyday rule
rule            #c8c8c2   #43464b    the emphatic one
pass            #1f6f43   #7fb595    a string your machine agrees with
fail            #a32d18   #dd9276    one it does not
```

Radii: 5px on a chip, 8px on a control, 16px on a sheet. Tap target 44px.

**Type** — three faces, three jobs, and the split is semantic rather than
decorative.

- **Literata** (serif) — what the level asks. The question, and page headings.
- **Inter** (sans) — everything you read as prose.
- **JetBrains Mono** — everything that is notation: set-builder, δ, state
  labels, test strings, tape cells, stack symbols, small uppercase labels.

If a thing is formal, it is monospaced. That rule is load-bearing: it is how the
app signals "this is mathematics" without saying so.

**Marks** — no fills, no shadows, no gradients. Structure comes from hairlines
and from space. A state is a circle with a hairline rim, not a filled disc; an
accepting state is a double rim; the active state during a trace is the one
place ink gets filled in.

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
