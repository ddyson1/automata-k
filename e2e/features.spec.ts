import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('stage')).toBeVisible();
}

/** Open a level and put its verified solution on the canvas. */
async function reveal(page: Page, levelId: string): Promise<void> {
  await open(page, levelId);
  await page.getByTestId('open-hint').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('score')).toContainText('All ');
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

  await page.getByTestId('open-machine').click();
  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = q1/ })).toBeVisible();
});

test('a rule opens from the ledger, and deleting it is felt immediately', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByTestId('open-machine').click();

  await page.getByRole('button', { name: /δ\(q0, 1\) = q1/ }).click();
  await expect(page.getByTestId('rule-head')).toHaveText('q0 → q1');
  await page.getByTestId('rule-delete').click();

  await expect(page.getByTestId('score')).not.toHaveText('All 12 agree');
  await expect(page.getByTestId('why')).toContainText('Shortest disagreement');
  await expect(page.getByTestId('delta-note')).toHaveText(
    'δ is partial: 3 of 4 pairs defined, 1 undefined.',
  );
});

test('an unwired pair is red in the ledger and activating it writes the rule', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await place(page, 0.5, 0.4);
  await page.getByTestId('open-machine').click();

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

test('grading is live: the marks change as the machine changes', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  await page.getByRole('button', { name: /^State q1/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await expect(page.getByTestId('score')).not.toHaveText('All 12 agree');

  await page.getByTestId('undo').click();
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

test('the overlay carries the theory and the analyses', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');
  await page.getByTestId('open-machine').click();
  const overlay = page.getByTestId('overlay');

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
  await page.getByTestId('open-machine').click();
  await page.getByTestId('tab-analysis').click();

  const overlay = page.getByTestId('overlay');
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
  const rows = page.getByTestId('level-row');
  await expect(rows.filter({ hasText: 'Last symbol' })).toBeEnabled();
  await expect(rows.filter({ hasText: 'Parity' })).toBeDisabled();
  await expect(rows.filter({ hasText: 'Beyond context free' })).toBeDisabled();
});
