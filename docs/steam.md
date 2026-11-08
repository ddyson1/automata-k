# Taking automata-k to Steam

Researched 8 November 2026. Every claim below is marked with how well it is
sourced, because a good deal of the public material on this subject is wrong in
ways that cost money.

**A caveat that applies to the whole Valve section.** The network in this
session refused `partner.steamgames.com`, `store.steampowered.com`,
`steamcommunity.com` and `steamdb.info`. Valve's wording below came through
search retrieval of those pages, corroborated across localised copies of the
same page, rather than a direct read. GitHub sources were read first-hand.
Before anyone spends the $100, read the Steamworks pages directly.

---

## The finding that reorders the work

Valve's own documentation says this about the in-game overlay:

> The Steam Overlay requires a game consistently render frames, not pausing
> rendering or rendering only part of the screen based on dirty rects.
> Unfortunately, web browsers do not support this model.

It then names the supported workaround: host an embedded Chromium inside a
native application with a D3D window, render Chromium offscreen, and draw the
resulting texture every frame in the native app.

The overlay is not a cosmetic feature. Steam injects a DLL that hooks the
graphics `Present` call *inside the game process*. Shift-Tab, achievement
toasts, F12 screenshots, friend invites and — on Windows — Steam Input's
emulated gamepad all ride on that hook finding a swapchain to attach to.

**automata-k today presents no frames at all.** `web/src/components/diagram.ts`
is 905 lines of DOM and inline SVG and contains no `requestAnimationFrame`;
positions are written straight onto SVG nodes during a drag and committed to
the store on release. The handful of `requestAnimationFrame` calls elsewhere in
`web/src` are one-shot deferrals — "measure after layout, then fit" — not a
loop. Nothing runs per frame, by design: `web/src/store.ts` opens by saying so,
and for a web app that is a virtue.

So the Canvas rewrite is not a polish item to be scheduled after the Steam
work. It is a precondition for it. And the version of the loop that ships to
Steam has to differ from the one that ships to the web in exactly one respect:
**it must not park itself when idle.** The prototype parks after 40 still
frames and says so in its counter; that is correct for a browser tab and fatal
for the overlay.

Prototype: <https://claude.ai/artifact/ScvY4APULH1LcgzBKZvZPQ>

---

## What Steam requires

### The fee

$100 per app, **recoupable, not refundable** — it comes back as a line item
against a payout once the app clears $1,000 adjusted gross revenue. If it never
clears $1,000, the $100 is simply spent. Several 2026 guides describe this as a
refund; they are wrong. *(High confidence, official.)*

Sequence: sign agreements → pay → bank, tax and identity verification → build a
store page → submit for review → Coming Soon → release.

- Identity and tax verification: **up to 30 days**.
- Store page review: 3–5 business days; Valve asks for 7 business days' notice.
- Build review: 1–5 days, separate from the store page.
- Coming Soon page must be live **at least two weeks** before release.

**Unresolved:** the waiting period between paying the fee and being allowed to
release is documented as **21 days** on the English onboarding page and **30
days** on a dated copy of the same page and on the Spanish and Italian ones. I
could not establish which is live. Do not plan a date on either number; the
Steamworks dashboard shows the real unlock date once the fee is paid. Plan on
roughly 30 days as a floor regardless, because verification and the Coming Soon
window dominate.

### The overlay, by shell

| Shell | Windows | macOS | Linux |
|---|---|---|---|
| Electron | **Works** with `--in-process-gpu` | **Broken, unfixed** | Works via sniper runtime |
| Tauri / WebView2 | Third-party plugin only | No | No |

**Electron on Windows** needs, in combination: `--in-process-gpu` on the real
command line (`app.commandLine.appendSwitch` has been reported not to take);
`SteamAPI_Init` called as the very first thing, in the **main** process;
sometimes `--disable-direct-composition`, without which the overlay can render
solid white; and a forced redraw every frame, because Chromium will not repaint
an unchanged page and the overlay then freezes. Several developers found the
flag silently dropped by their packager and only noticed in the Steam-launched
build. *(High confidence as community consensus — no official Valve or Electron
endorsement. Primary sources: electron#18048, steamworks.js#63.)*

**Electron on macOS** does not get the overlay. electron#42656 was closed "not
planned" the same day it was filed, on backlog policy, with no technical
assessment, and was still being cited as broken in October 2026.

**Tauri/WebView2** cannot show the overlay natively. Ashley Gullen (Construct)
traced it to an alpha mismatch — DirectComposition blends premultiplied alpha,
the Steam overlay renders straight alpha — and concluded a proper fix has to
come from Valve. He later got it working *without transparency*. Valve's only
reply to his investigation restated the supported graphics APIs and then went
quiet. There is now a real workaround, `PSG-Team/tauri-steam-overlay-surface`:
a transparent click-through decoy window presenting empty frames at vsync for
Steam to draw into, verified on a live Steam build in July 2026 and built for a
shipped game. It is MIT, Windows-only, and v0.1.2. *(High confidence that it
does what it claims; it is a single-game-driven project at version 0.1, which
is real risk.)*

**The overlay is optional.** Ship without it and Steam shows its normal window
over the game. You lose Shift-Tab, in-game toasts, F12 screenshots and the
friends UI; programmatic `activateOverlay`-style calls still work.

### Steam Deck

The checklist is now a combined Deck **and Steam Machine** review. Display
tests are not run for Steam Machine, and Valve has said Steam Machine
verification will carry fewer constraints.

What bites a Canvas app:

- **Text at 1280×800 must be at least 9px; 12px recommended.** This is the most
  common failure across every source. Measured in the current build, three
  styles sit between the floor and the recommendation: `.brief-eyebrow` at
  **9.5px** (`web/src/app.css:244`), `.t-label` at **10px**
  (`web/src/theme.css:221`) — which `theme.css` itself calls "the one
  structural device: a mono label above every band", so it is everywhere — and
  `table.subset-table th` at **10px** (`web/src/app.css:1478`). All three clear
  the 9px approval floor and all three are under the 12px recommendation. A
  Deck renders at 1× at that resolution, so these are literal sizes.
- The **default controller configuration must reach every function**.
- The **on-screen keyboard must appear automatically** wherever text is entered.
  That is the state-rename field.
- No unsupported-distribution or unsupported-GPU warnings.
- Valve strongly recommends against a launcher at all.

On a Linux depot: Valve's own engineers, in `ValveSoftware/steam-runtime#579`,
recommend building Electron against the **sniper** runtime, and say that a
developer without a Linux depot can reasonably let **Proton** serve Deck users
instead. That second option is the cheaper one for a small team.
*(High confidence — primary thread, named Valve engineers.)*

Electron's Chrome sandbox commonly fails when launched from Steam on Linux. The
published recipe is `--no-sandbox --no-zygote --in-process-gpu
--disable-dev-shm-usage`, plus prepending the bundled `libsteam_api.so` to
`LD_LIBRARY_PATH`. `--no-sandbox` is a genuine security trade; it is defensible
here only because automata-k loads nothing but its own bundled code and makes
no network calls at all.

### Controllers

Two paths, and the choice matters more than it looks.

**The Gamepad API alone is fragile.** On Windows it is the *Steam Overlay* that
hooks XInput/RawInput and injects the emulated pad — the same injection that
fails on a webview. electron#45989 records gamepads working when run directly
and not when launched through Steam with Steam Input on, across several Electron
versions; it was closed as "fixed by Steam in the 9th September patch" in
September 2025 and someone reported it still broken in April 2026. You also
cannot turn Steam Input off from the app; that is the user's switch.

**Use the Steam Input API instead.** Action sets, correct glyphs, and the
per-controller default configs Deck Verified wants, without depending on the
overlay's hooks landing. Keep the Gamepad API as the fallback for the web and
itch builds.

### Bindings

| Package | Status, Nov 2026 | SDK |
|---|---|---|
| `steamworks-rs` (Rust) | **Active** — commits last month | 1.65 |
| `steamworks-ffi-node` | **Active** — tested Aug 2026 | 1.64 |
| `steamworks.js` | **Dormant** — no 2026 commits | — |
| `greenworks` | Frozen, "best-effort" by its own README | 1.62 |

`steamworks.js` is the trap: it is the package nearly every tutorial
recommends, its own README argues convincingly against greenworks, and it has
had no commits in 2026. It covers achievements, stats, cloud saves, rich
presence, Steam Input, workshop, P2P and overlay dialogs — but **no
leaderboards at all**, which is exactly the gap that forced a design change on
the closest precedent to this project.

---

## The shell: Electron

Electron, on the evidence, despite preferring Tauri on every other axis.

Tauri wins on bundle size and has the healthier binding by a distance
(`steamworks-rs`, SDK 1.65, active). But its overlay story is a Windows-only
third-party plugin at v0.1.x, and the process isolation that breaks the overlay
very likely also undermines Steam Input's gamepad emulation — the two failures
share a cause. Electron gives a working Windows overlay with known flags, a
Valve-endorsed Linux path, and by far the deepest body of prior art.

Cost of that choice: ~150MB instead of ~10MB, no macOS overlay, and a primary
binding (`steamworks-ffi-node`) that is healthy but young.

Two decisions follow, and both are cheap:

1. **Windows first.** It is where the overlay works and where the players are.
2. **No Linux depot at first.** Let Proton serve the Deck, per Valve's own
   advice, and add a sniper-built depot only if Proton proves inadequate.

---

## The renderer

### What "tangible" should mean here

The app's visual language is achromatic hairlines, no fills, no shadows, no
gradients, with colour reserved entirely for a verdict. That restraint is the
best thing about it and the Steam build should not spend it. Gloss would make
this look like every other asset-flip on the store.

What is missing is not decoration. It is **weight**. A state teleports when you
Tidy. An arrow appears fully formed. A trace advances in discrete jumps with no
travel between them. Nothing in the app has mass, and a machine is a machine —
it should feel like one.

The prototype demonstrates six things, all inside the existing palette:

- **States are discs with mass.** They lag behind the pointer, carry momentum
  on release, and spring-settle. A contact shadow tightens and loosens as the
  disc lifts off the surface and lands.
- **Neighbours nudge each other apart** by moving targets, not velocities, so
  the graph settles rather than jitters.
- **Arrows are elastic.** The band sags while slack, thins as it stretches, and
  whatever slack is left snaps out of it on release as a damped oscillation.
- **Tidy travels.** The layered layout becomes a set of spring targets, so the
  machine reorganises itself in front of you. This also answers a complaint
  from earlier in the project: the old Tidy was correct and felt like nothing.
- **A trace is a token physically travelling the curve** at even arc-length
  speed, with the input sliding under a read head that never moves.
- **The ring is the handle for arrows, the core is the handle for moving.** Two
  concentric targets on one state. This is the useful accident of the
  prototype: it is also an answer to problem 2 in `docs/design-brief.md` —
  drawing an arrow with a finger — and there is no hover anywhere in it.

### What it costs

The honest price is not the physics. The integrator is about forty lines and
the convincing part is cheap; tuning it so a twelve-state PDA settles without
looking like jelly is the slow part.

**The price is the DOM.** Moving to Canvas gives up per-state focus rings, the
screen-reader tree, `:hover`, browser text selection and the browser's own hit
testing. The app gets all of that free today and would have to rebuild it by
hand. For a teaching tool used by students, some of whom will be using a screen
reader, that is not a small thing — it is the one part of this plan that
deserves an argument before it is started.

A reasonable resolution: keep an invisible, correctly-labelled DOM layer over
the canvas carrying one focusable element per state and per transition, and let
Canvas own only the pixels. That is more work than it sounds and less work than
rebuilding accessibility from nothing.

---

## What none of this fixes

The closest precedent to automata-k is **SIC-1**, a single-instruction
programming puzzle game built in web tech and shipped on Steam, whose author
wrote an unusually honest multi-part retrospective. The parts worth internalising:

- He started on WebView2 to keep the download under 30MB and reversed:
  *"I should have just used Electron from the beginning."*
- He released it **free**, on the reasoning that most indie games earn under
  $4,000 lifetime and his would likely have landed below that.
- 1,700 players completed the first puzzle. **Eleven** finished the last one.

That last number is the one to sit with. It is not an argument against
shipping; it is an argument about what shipping is for. A beautiful, weighty,
overlay-enabled Steam build of automata-k will not convert a formal languages
course into a commercial audience. If the goal is for the thing to be *used* —
by students, on a course, on a phone on a bus — the web build is already the
right distribution and the renderer work pays off there immediately. Steam is
worth doing for reach and for the artefact being a real thing, not for revenue.

---

## Sequence

Each step is useful on its own, and nothing is wasted if the next one is never
taken.

1. **Rewrite the renderer on Canvas, in the web app, with the loop parking when
   idle.** Ships to the web, improves the thing everybody actually uses, and is
   a precondition for everything below. Build the invisible accessibility layer
   as part of this, not after it.
2. **Raise the three sub-12px label styles** named above. Cheapest possible
   Deck failure to avoid, perhaps an hour of work, and it improves the web
   build too.
3. **Steam Input action sets**, behind the same interface as the keyboard
   bindings, with the Gamepad API as the web fallback.
4. **Electron shell, Windows only**, with the loop no longer parking:
   `--in-process-gpu` verified in the *packaged, Steam-launched* build, Steam
   init first in the main process, forced redraw each frame.
5. **Pay the $100, start the clock**, build the store page during the
   verification window.
6. **Deck via Proton.** Add a sniper Linux depot only if Proton disappoints.

Steps 1–3 are worth doing whether or not Steam ever happens.
