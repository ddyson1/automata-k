import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('stage')).toBeVisible();
}

/** Open a level, put its verified solution on the canvas, and run the checks. */
async function reveal(page: Page, levelId: string): Promise<void> {
  await open(page, levelId);
  await tab(page, 'hint');
  await page.getByTestId('reveal').click();
  await run(page);
  await expect(page.getByTestId('score')).toContainText('All ');
}

/** Grading happens on a press, so every assertion about a mark needs one. */
async function run(page: Page): Promise<void> {
  await page.getByTestId('run').click();
}

/**
 * Open the pane, if it is not already. On a wide window it is a column and is
 * always open; on a phone it is a rail across the top that opens full screen.
 */
async function openPane(page: Page): Promise<void> {
  const grab = page.getByTestId('pane-grab');
  if (!(await grab.isVisible())) return;
  if (await page.getByTestId('pane').evaluate((el) => el.classList.contains('is-open'))) return;
  await grab.click();
}

/** Show a tab of the pane, opening the pane first where it is a rail. */
async function tab(page: Page, key: string): Promise<void> {
  await openPane(page);
  await page.getByTestId(`tab-${key}`).click();
}

/** Place a state at a fraction of the canvas, so it lands on any viewport. */
async function place(page: Page, fx: number, fy: number): Promise<void> {
  const canvas = page.getByTestId('diagram');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await canvas.dblclick({ position: { x: box.width * fx, y: box.height * fy } });
}

/**
 * Drag from a state's grip to another state, which is how an arrow is made.
 * The grips appear on hover, so the pointer goes to the state first.
 */
async function drawArrow(page: Page, fromLabel: string, toLabel: string): Promise<void> {
  const from = page.getByRole('button', { name: new RegExp(`^State ${fromLabel}`) });
  await from.scrollIntoViewIfNeeded();
  await from.hover();
  const grip = from.locator('.state-grip').first();
  const gripBox = await grip.boundingBox();
  const target = page.getByRole('button', { name: new RegExp(`^State ${toLabel}`) });
  const targetBox = await target.boundingBox();
  if (!gripBox || !targetBox) throw new Error('no grip or target');

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}

test('double clicking the canvas places a state, and only that', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await expect(page.getByTestId('empty-prompt')).toBeVisible();

  await place(page, 0.5, 0.4);
  await expect(page.getByRole('button', { name: /^State q0, start/ })).toBeVisible();
  await expect(page.getByTestId('empty-prompt')).toBeHidden();

  // The new state is selected, so its own controls are on screen next to it.
  await expect(page.getByTestId('state-bar')).toBeVisible();
  await expect(page.getByTestId('set-start')).toBeVisible();
});

test('the grip on a selected state draws an arrow, and opens its rule', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await place(page, 0.28, 0.32);
  await place(page, 0.72, 0.32);

  await drawArrow(page, 'q0', 'q1');

  await expect(page.getByTestId('rule-sheet')).toBeVisible();
  await expect(page.getByTestId('rule-head')).toHaveText('q0 → q1');
  await page.getByTestId('rule-commit').click();

  await tab(page, 'machine');
  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = q1/ })).toBeVisible();
});

test('a rule opens from the ledger, and deleting it is felt immediately', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await tab(page, 'machine');

  await page.getByRole('button', { name: /δ\(q0, 1\) = q1/ }).click();
  await expect(page.getByTestId('rule-head')).toHaveText('q0 → q1');
  await page.getByTestId('rule-delete').click();

  // The marks go blank the moment the machine stops being the one that ran.
  await expect(page.getByTestId('score')).toHaveText('Not checked yet');
  await run(page);
  await expect(page.getByTestId('score')).not.toHaveText('All 12 agree');
  await expect(page.getByTestId('why')).toContainText('Shortest disagreement');
  await expect(page.getByTestId('delta-note')).toHaveText(
    'δ is partial: 3 of 4 pairs defined, 1 undefined.',
  );
});

test('an unwired pair is red in the ledger and activating it writes the rule', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await place(page, 0.5, 0.4);
  await tab(page, 'machine');

  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = undefined/ })).toBeVisible();
  await expect(page.getByTestId('delta-note')).toHaveText(
    'δ is partial: 0 of 2 pairs defined, 2 undefined.',
  );

  await page.getByRole('button', { name: /δ\(q0, 0\) = undefined/ }).click();
  await page.getByTestId('rule-commit').click();

  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = q0/ })).toBeVisible();
  await expect(page.getByTestId('delta-note')).toHaveText(
    'δ is partial: 1 of 2 pairs defined, 1 undefined.',
  );
});

test('grading follows the run button, not the machine', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  await page.getByRole('button', { name: /^State q1/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await run(page);
  await expect(page.getByTestId('score')).not.toHaveText('All 12 agree');

  await page.getByTestId('undo').click();
  await run(page);
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');
});

test('a machine that is not a DFA is reported rather than simulated', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await place(page, 0.28, 0.32);
  await place(page, 0.72, 0.32);

  // Two arrows out of q0 on the same symbol, which no DFA is allowed.
  for (const target of ['q0', 'q1']) {
    await drawArrow(page, 'q0', target);
    await page.getByTestId('rule-commit').click();
  }

  await run(page);
  await expect(page.getByTestId('score')).toHaveText('Not a machine yet');
  await expect(page.getByTestId('why')).toContainText(/deterministic/i);
});

test('a string in the brief plays its own trace, with the stack', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await openPane(page);
  await page.locator('[data-input="aabb"]').click();

  await expect(page.getByTestId('trace')).toBeVisible();
  await expect(page.getByTestId('trace-memory')).toContainText('Stack');
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');
  await expect(page.locator('.verdict.is-playing')).toHaveCount(1);

  // Starting a trace closes the pane, so the transport has the screen to itself.
  await expect(page.getByTestId('pane')).not.toHaveClass(/is-open/);
  await expect(page.getByTestId('trace-counter')).toHaveText(/^1\/\d+$/);
  await page.getByTestId('trace-forward').click();
  await expect(page.getByTestId('trace-counter')).toHaveText(/^2\/\d+$/);

  await page.getByTestId('trace-close').click();
  await expect(page.getByTestId('trace')).toBeHidden();
});

test('a Turing machine trace shows the tape and the head', async ({ page }) => {
  await reveal(page, 'tm-an-bn');
  await openPane(page);
  await page.locator('[data-input="ab"]').click();
  await expect(page.getByTestId('trace-memory')).toContainText('Tape');
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');
  await expect(page.getByTestId('trace-memory').locator('.cellx.is-head')).toHaveCount(1);
});

test('undo and redo walk the edit history', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await expect(page.getByTestId('undo')).toBeDisabled();

  await place(page, 0.28, 0.32);
  await place(page, 0.72, 0.32);
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.getByTestId('undo').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
});

test('the pane carries the theory and the analyses', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');
  const overlay = page.getByTestId('panel');

  await tab(page, 'theory');
  await expect(overlay.getByText('S → ε | aBC | aSBC')).toBeVisible();
  await expect(overlay.getByText('CB → BC', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Chomsky type 1')).toBeVisible();
  await expect(overlay.getByText(/6 states: q0, q1, q2, q3, q4, qa/)).toBeVisible();

  await tab(page, 'analysis');
  await expect(page.getByTestId('analysis-declined')).toBeVisible();
});

test('analysis reports minimality, determinisation and a regex', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await tab(page, 'analysis');

  const overlay = page.getByTestId('panel');
  await expect(overlay.getByTestId('minimal-verdict')).toContainText('Minimal.');

  await page.getByTestId('tab-regex').click();
  await expect(overlay.getByTestId('regex-source')).toHaveText('0*1(1|00*1)*');

  await page.getByTestId('tab-subset').click();
  await expect(overlay.getByTestId('subset-table')).toBeVisible();
});

test('the canvas grows its visible region with the window', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const svg = page.getByTestId('diagram');

  const wide = await svg.getAttribute('viewBox');
  await page.setViewportSize({ width: 520, height: 900 });
  await expect.poll(async () => svg.getAttribute('viewBox'), { timeout: 5000 }).not.toBe(wide);

  // The sheet stays centred in whatever region is on show.
  const narrow = (await svg.getAttribute('viewBox')) ?? '';
  const [x, y, w, h] = narrow.split(' ').map(Number) as [number, number, number, number];
  expect(x + w / 2).toBeCloseTo(170, 1);
  expect(y + h / 2).toBeCloseTo(230, 1);
});

test('a state drags to a new position and commits once', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const state = page.getByRole('button', { name: /^State q0/ });
  await state.scrollIntoViewIfNeeded();
  const before = await state.boundingBox();
  if (!before) throw new Error('no state');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2 + 30, {
    steps: 10,
  });
  await page.mouse.up();

  const after = await state.boundingBox();
  if (!after) throw new Error('no state');
  expect(after.x).toBeGreaterThan(before.x + 12);

  // One undo puts it back, so the drag committed a single edit and not thirty.
  await page.getByTestId('undo').click();
  const undone = await state.boundingBox();
  if (!undone) throw new Error('no state');
  expect(undone.x).toBeCloseTo(before.x, 0);
});

test('locked levels stay locked until the one before them is solved', async ({ page }) => {
  await page.goto('/');
  // Selected by level id, not by title: titles are prose and two of them can
  // share a word, which is a flaky test rather than a broken game.
  const row = (id: string) => page.locator(`[data-testid="level-row"][data-level="${id}"]`);
  await expect(row('dfa-ends-in-1')).toBeEnabled();
  await expect(row('dfa-even-zeros')).toBeDisabled();
  await expect(row('tm-an-bn-cn')).toBeDisabled();
});

/**
 * The theory panel used to hold a four column table in a horizontal scroller,
 * 877 units of it in a 343 unit column, so two columns were always off the
 * edge and the wheel only reached them about a third of the time. Nothing in
 * the panel may be wider than the panel.
 */
test('nothing in the formal layer needs a sideways scroll', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');

  for (const key of ['brief', 'machine', 'theory', 'analysis', 'hint']) {
    await tab(page, key);
    // The pane's scroll box, which is the container in every tab including
    // the brief; the panel itself is hidden while the brief is showing.
    const over = await page.locator('.pane-body').evaluate((body) => {
      const limit = body.clientWidth;
      return [...body.querySelectorAll('*')]
        // The subset table is allowed one: it grows a column per input symbol.
        .filter((n) => !n.closest('.scroll-x'))
        .filter((n) => Math.round(n.getBoundingClientRect().width) > limit + 1)
        .map((n) => `${n.tagName.toLowerCase()}.${n.className}`);
    });
    expect(over, `${key} tab`).toEqual([]);
  }
});

/**
 * The three analysis readings all decline on a PDA, which made three tabs that
 * each produced a paragraph of grey prose and looked like three tabs that did
 * nothing. They now say which apply before they are pressed.
 */
test('the analysis sub tabs say which of them apply to this machine', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await tab(page, 'analysis');

  const tabs = page.getByTestId('panel').locator('.tabs .tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ has: page.locator('.tab-mark') })).toHaveCount(3);
  await expect(page.getByTestId('analysis-none')).toBeVisible();

  // On an NFA, minimisation is the only one that does not apply.
  await reveal(page, 'nfa-third-last-1');
  await tab(page, 'analysis');
  await expect(page.getByTestId('analysis-none')).toBeHidden();
  await expect(page.getByTestId('tab-minimal')).toHaveClass(/is-off/);
  await expect(page.getByTestId('tab-subset')).not.toHaveClass(/is-off/);
  // The applicable one opens, rather than a declining one.
  await expect(page.getByTestId('subset-table')).toBeVisible();

  // And pressing each one changes the panel.
  await page.getByTestId('tab-regex').click();
  await expect(page.getByTestId('regex-source')).toBeVisible();
  await page.getByTestId('tab-minimal').click();
  await expect(page.getByTestId('analysis-declined')).toBeVisible();
});

/**
 * The formal layer used to be a sheet over the brief, so going to read the
 * transition function took the verdict off screen — exactly when you wanted
 * it. As tabs of the pane it cannot: the whole rail — which level, what it
 * asks, and how it is going — sits above them on every tab.
 */
test('the level line and the verdict survive every tab', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  for (const key of ['brief', 'machine', 'theory', 'analysis', 'hint']) {
    await tab(page, key);
    await expect(page.getByTestId('back'), key).toBeVisible();
    await expect(page.getByTestId('goal'), key).toBeVisible();
    await expect(page.getByTestId('score'), key).toHaveText('All 12 agree');
    await expect(page.getByTestId(`tab-${key}`), key).toHaveClass(/is-on/);
  }

  // Only one thing is showing at a time.
  await tab(page, 'brief');
  await expect(page.getByTestId('brief')).toBeVisible();
  await expect(page.getByTestId('panel')).toBeHidden();

  // Five tabs have to fit the pane rather than scroll sideways.
  const strip = await page
    .locator('.pane-tabs')
    .evaluate((n) => ({ client: n.clientWidth, scroll: n.scrollWidth }));
  expect(strip.scroll, 'the tab strip fits').toBeLessThanOrEqual(strip.client);
});

/**
 * Rearranging is not editing. Tidy rewrites every coordinate and Rename
 * rewrites a label, and neither can turn a tick into a cross, so neither may
 * throw away a run that is still true.
 */
test('moving states around does not invalidate a run', async ({ page }) => {
  await reveal(page, 'dfa-contains-01');
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');

  await page.getByTestId('tidy').click();
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');

  // But an edit that could change a verdict does.
  await page.getByRole('button', { name: /^State q0/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await expect(page.getByTestId('score')).toHaveText('Not checked yet');
});

/** The one sound the app makes, and the fact that it can be turned off. */
test('a passing run makes a sound, unless it is switched off', async ({ page }) => {
  const played: number[] = [];
  // Recorded off setValueAtTime rather than off the nodes. A param's `.value`
  // reads the audio clock, and every note here is scheduled in the future, so
  // at the moment it is created it still reports the 440 default. What is
  // scheduled is the truth. Gains are all below 1 and pitches all above 100,
  // so one threshold separates them.
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: number[] };
    w.__notes = [];
    const real = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function patched(
      this: AudioParam,
      value: number,
      when: number,
    ) {
      if (value > 100) w.__notes.push(value);
      return real.call(this, value, when);
    };
  });

  await reveal(page, 'dfa-ends-in-1');
  played.push(...(await page.evaluate(() => (window as unknown as { __notes: number[] }).__notes)));
  // Both notes, each with its octave partial: a fifth, not a single beep.
  expect(played.map(Math.round).sort((a, b) => a - b)).toEqual([587, 880, 1175, 1760]);

  // Off, from the home screen, and it stays off across a reload.
  await page.getByTestId('back').click();
  await page.getByTestId('sound').click();
  await expect(page.getByTestId('sound')).toHaveText('Sound off');
  await page.reload();
  await expect(page.getByTestId('sound')).toHaveText('Sound off');

  await page.evaluate(() => ((window as unknown as { __notes: number[] }).__notes.length = 0));
  await reveal(page, 'dfa-ends-in-1');
  const after = await page.evaluate(() => (window as unknown as { __notes: number[] }).__notes);
  expect(after, 'silent once switched off').toEqual([]);
});

/** Tidy has to leave every state where it can be seen, clear of its neighbours. */
test('tidy spreads the states out instead of piling them up', async ({ page }) => {
  await reveal(page, 'dfa-contains-01');
  await page.getByTestId('tidy').click();

  const centres = await page.locator('.state').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  expect(centres.length).toBe(3);

  // All on one line, left to right, and far enough apart for their self loops.
  const ys = centres.map((c) => Math.round(c.y));
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);

  const drawn = await page.locator('.state-ring').first().evaluate((n) => n.getBoundingClientRect().width / 2);
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const gap = Math.hypot(
        (centres[i] as { x: number }).x - (centres[j] as { x: number }).x,
        (centres[i] as { y: number }).y - (centres[j] as { y: number }).y,
      );
      // 1.82 radii is how far a self loop reaches from its own centre.
      expect(gap).toBeGreaterThan(1.82 * drawn + drawn);
    }
  }
});

/**
 * Within a session a level holds what you drew on it while you go and look at
 * another, which is one train of thought. Clearing takes one level off without
 * touching the rest, so getting back to blank costs neither a reload nor the
 * work in progress next door.
 */
test('a level can be emptied without touching the other levels', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const before = await page.locator('.state').count();
  expect(before).toBeGreaterThan(0);

  // Something on another level, to prove clearing is not global. Level two,
  // which the reveal above just unlocked, so the list shows it as it would in
  // ordinary play rather than as Locked.
  await open(page, 'dfa-even-zeros');
  await place(page, 0.35, 0.32);
  await expect(page.locator('.state')).toHaveCount(1);

  // Within the session the list says which levels have work on them.
  const row = (id: string) => page.locator(`[data-testid="level-row"][data-level="${id}"]`);
  await page.getByTestId('back').click();
  await expect(row('dfa-even-zeros')).toContainText('1 state drawn');

  await open(page, 'dfa-ends-in-1');
  await tab(page, 'hint');
  await page.getByTestId('clear').click();
  await expect(page.locator('.state')).toHaveCount(0);
  await expect(page.getByTestId('empty-prompt')).toBeVisible();

  // It is an edit like any other, so undo puts the machine back.
  await page.getByTestId('undo').click();
  await expect(page.locator('.state')).toHaveCount(before);

  // Clear it again, and the level next door still has its state.
  await tab(page, 'hint');
  await page.getByTestId('clear').click();
  await open(page, 'dfa-even-zeros');
  await expect(page.locator('.state')).toHaveCount(1);

  // And the cleared one reads like a level nobody has drawn on again.
  await page.getByTestId('back').click();
  await expect(row('dfa-ends-in-1')).not.toContainText('drawn');
});

/**
 * The complaint this comes from: opening level one and finding states on it.
 * They were the player's own, from a sitting they no longer remembered, which
 * on arrival is indistinguishable from a starting position the game put there.
 * Nothing is carried across a load now — not the machine, not the undo stack,
 * and not on any level.
 */
test('every level opens on a blank canvas, however much was drawn before', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  expect(await page.locator('.state').count()).toBeGreaterThan(0);

  await open(page, 'dfa-even-zeros');
  await place(page, 0.35, 0.32);
  await place(page, 0.65, 0.32);
  await expect(page.locator('.state')).toHaveCount(2);

  await page.reload();
  await expect(page.locator('.state')).toHaveCount(0);
  await expect(page.getByTestId('empty-prompt')).toBeVisible();
  await expect(page.getByTestId('undo')).toBeDisabled();

  await open(page, 'dfa-ends-in-1');
  await expect(page.locator('.state')).toHaveCount(0);
  await expect(page.getByTestId('score')).toHaveText('Nothing drawn yet');

  // Solving level one is a fact about the player and is kept; the machine that
  // got them there is not. Nothing on the list claims drawn work either.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('solved-count')).toHaveText(/^1\/\d+$/);
  await expect(page.getByTestId('level-row').filter({ hasText: 'drawn' })).toHaveCount(0);

  // And no draft is left behind in storage for a later build to find.
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).not.toContain('automata-k.drafts.v1');
});

/** Nothing drawn, nothing to take off: the offer only exists when it applies. */
test('the clear action is absent on an untouched canvas', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await tab(page, 'hint');
  await expect(page.getByTestId('reveal')).toBeVisible();
  await expect(page.getByTestId('clear')).toHaveCount(0);

  // A reload puts the pane back where it opens, so the canvas is reachable on
  // a phone — where the pane is a sheet over it — as well as on a desktop.
  await page.reload();
  await place(page, 0.35, 0.32);
  await tab(page, 'hint');
  await expect(page.getByTestId('clear')).toBeVisible();
});
