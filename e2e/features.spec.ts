import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('stage')).toBeVisible();
}

/** Open a level, put its verified solution on the canvas, and run the checks. */
async function reveal(page: Page, levelId: string): Promise<void> {
  await open(page, levelId);
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal').click();
  await run(page);
  await expect(page.getByTestId('score')).toContainText('All ');
}

/** Grading happens on a press, so every assertion about a mark needs one. */
async function run(page: Page): Promise<void> {
  await page.getByTestId('run').click();
}

/**
 * On a phone the brief is a sheet that peeks; the lists are below the fold
 * until it is pulled up. On a wide window it is a column and there is nothing
 * to pull.
 */
async function openBrief(page: Page): Promise<void> {
  const grab = page.getByTestId('pane-grab');
  if (!(await grab.isVisible())) return;
  if (await page.getByTestId('pane').evaluate((el) => el.classList.contains('is-open'))) return;
  await grab.click();
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

  await page.getByTestId('tab-machine').click();
  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = q1/ })).toBeVisible();
});

test('a rule opens from the ledger, and deleting it is felt immediately', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByTestId('tab-machine').click();

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
  await page.getByTestId('tab-machine').click();

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
  await openBrief(page);
  await page.locator('[data-input="aabb"]').click();

  await expect(page.getByTestId('trace')).toBeVisible();
  await expect(page.getByTestId('trace-memory')).toContainText('Stack');
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');
  await expect(page.locator('.verdict.is-playing')).toHaveCount(1);

  // Starting a trace drops the brief back to peeking, so the transport is free.
  await expect(page.getByTestId('pane')).not.toHaveClass(/is-open/);
  await expect(page.getByTestId('trace-counter')).toHaveText(/^1\/\d+$/);
  await page.getByTestId('trace-forward').click();
  await expect(page.getByTestId('trace-counter')).toHaveText(/^2\/\d+$/);

  await page.getByTestId('trace-close').click();
  await expect(page.getByTestId('trace')).toBeHidden();
});

test('a Turing machine trace shows the tape and the head', async ({ page }) => {
  await reveal(page, 'tm-an-bn');
  await openBrief(page);
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

  await page.getByTestId('tab-theory').click();
  await expect(overlay.getByText('S → ε | aBC | aSBC')).toBeVisible();
  await expect(overlay.getByText('CB → BC', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Chomsky type 1')).toBeVisible();
  await expect(overlay.getByText(/6 states: q0, q1, q2, q3, q4, qa/)).toBeVisible();

  await page.getByTestId('tab-analysis').click();
  await expect(page.getByTestId('analysis-declined')).toBeVisible();
});

test('analysis reports minimality, determinisation and a regex', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByTestId('tab-analysis').click();

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
  await expect(row('dfa-ends-in-1')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(row('dfa-even-zeros')).toHaveAttribute('aria-disabled', 'true');
  await expect(row('tm-an-bn-cn')).toHaveAttribute('aria-disabled', 'true');

  // A locked level still says what it is and what unlocks it, by keyboard as
  // well as by pointer: a level nobody can read is a level nobody can want.
  await row('tm-an-bn-cn').focus();
  await expect(page.getByTestId('readout')).toContainText('locked until level 40 is solved');
  await expect(page.getByTestId('readout-play')).toBeHidden();
});

/**
 * The theory panel used to hold a four column table in a horizontal scroller,
 * 877 units of it in a 343 unit column, so two columns were always off the
 * edge and the wheel only reached them about a third of the time. Nothing in
 * the panel may be wider than the panel.
 */
test('nothing in the formal layer needs a sideways scroll', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');

  for (const tab of ['brief', 'machine', 'theory', 'analysis', 'hint']) {
    await page.getByTestId(`tab-${tab}`).click();
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
    expect(over, `${tab} tab`).toEqual([]);
  }
});

/**
 * The three analysis readings all decline on a PDA, which made three tabs that
 * each produced a paragraph of grey prose and looked like three tabs that did
 * nothing. They now say which apply before they are pressed.
 */
test('the analysis sub tabs say which of them apply to this machine', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await page.getByTestId('tab-analysis').click();

  const tabs = page.getByTestId('panel').locator('.tabs .tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ has: page.locator('.tab-mark') })).toHaveCount(3);
  await expect(page.getByTestId('analysis-none')).toBeVisible();

  // On an NFA, minimisation is the only one that does not apply.
  await reveal(page, 'nfa-third-last-1');
  await page.getByTestId('tab-analysis').click();
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
 * it. As tabs of the pane it cannot: the level line is above them and the
 * verdict is below them, on every tab.
 */
test('the level line and the verdict survive every tab', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  for (const tab of ['brief', 'machine', 'theory', 'analysis', 'hint']) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId('back'), tab).toBeVisible();
    await expect(page.getByTestId('score'), tab).toHaveText('All 12 agree');
    await expect(page.getByTestId(`tab-${tab}`), tab).toHaveClass(/is-on/);
  }

  // Only one thing is showing at a time.
  await page.getByTestId('tab-brief').click();
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

/**
 * The home screen is the hierarchy, and its claim has to hold: a level sits in
 * the smallest ring that can hold its language, not in the ring of the machine
 * you draw it with. Four tape levels sit in the context free ring, and that is
 * the whole reason the picture is worth drawing.
 */
test('the rings hold levels by language, not by machine', async ({ page }) => {
  await page.goto('/');

  const inRing = async (type: number): Promise<string[]> =>
    page
      .locator(`[data-testid="ring-${type}"] > .dots > .dot`)
      .evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.level as string));

  const regular = await inRing(3);
  const contextFree = await inRing(2);
  const contextSensitive = await inRing(1);

  expect(regular.length + contextFree.length + contextSensitive.length).toBe(42);
  // Every finite automaton level is regular, and nothing else is.
  expect(regular.every((id) => id.startsWith('dfa-') || id.startsWith('nfa-'))).toBe(true);
  // Tape levels whose language a stack could manage sit with the stacks.
  expect(contextFree).toContain('tm-palindrome');
  expect(contextFree).toContain('tm-equal-ab');
  // And the two that no stack can manage sit outside them.
  expect(contextSensitive).toEqual(['tm-an-bn-cn', 'tm-abcd']);

  // Type 0 has nothing in it, and says so rather than showing an empty box.
  await expect(page.locator('[data-testid="ring-0"] > .ring-empty')).toBeVisible();
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
