import { expect, test, type Page } from '@playwright/test';

/** Open a level and put its verified solution on the canvas. */
async function reveal(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('diagram-card')).toBeVisible();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('suite-verdict')).toHaveText('Every test passes');
}

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('diagram-card')).toBeVisible();
}

test('a rule opens from the ledger, and deleting it is felt immediately', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  await page.getByRole('button', { name: /δ\(q0, 1\) = q1/ }).click();
  await expect(page.getByTestId('rule-sheet')).toBeVisible();
  await expect(page.getByTestId('rule-head')).toHaveText('q0 → q1');

  await page.getByTestId('rule-delete').click();

  // The live suite noticed without being asked, and δ is short a pair.
  await expect(page.getByTestId('suite-verdict')).not.toHaveText('Every test passes');
  await expect(page.getByTestId('suite-detail')).toContainText('Shortest disagreement');
  await expect(page.getByTestId('delta-note')).toHaveText(
    'δ is partial: 3 of 4 pairs defined, 1 undefined.',
  );
  await expect(page.getByRole('button', { name: /δ\(q0, 1\) = undefined/ })).toBeVisible();
});

test('changing a rule to a symbol already covered is reported, not simulated', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  // Sending δ(q0, 1) to 0 leaves two arrows out of q0 on 0, which is no longer
  // deterministic. The grader says so rather than picking one and guessing.
  await page.getByRole('button', { name: /δ\(q0, 1\) = q1/ }).click();
  await page.getByTestId('field-read').getByRole('radio', { name: '0' }).click();
  await page.getByTestId('rule-commit').click();

  await expect(page.getByTestId('suite-verdict')).toHaveText('Not a machine yet');
  await expect(page.getByTestId('suite-detail')).toContainText(
    'Two arrows leave q0 on 0. A deterministic machine allows only one.',
  );
});

test('an unwired pair is listed in red and activating it writes the rule', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await page.getByTestId('add-state').click();

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

test('grading is live: the strip recolours as the machine changes', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  // Un-accept the accepting state; the suite goes red without being asked.
  await page.getByRole('button', { name: /^State q1/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await expect(page.getByTestId('suite-verdict')).toHaveText('Tests');

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('suite-verdict')).toHaveText('Every test passes');
});

test('tapping a test plays its trace, with the stack', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await page.getByTestId('suite-cell').filter({ hasText: /^aabb$/ }).click();

  await expect(page.getByTestId('trace')).toBeVisible();
  await expect(page.getByTestId('trace-memory')).toContainText('Stack');
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');

  await expect(page.getByTestId('trace-counter')).toHaveText(/^1\/\d+$/);
  await page.getByTestId('trace-forward').click();
  await expect(page.getByTestId('trace-counter')).toHaveText(/^2\/\d+$/);
});

test('a Turing machine trace shows the tape and the head', async ({ page }) => {
  await reveal(page, 'tm-an-bn');
  await page.getByTestId('suite-cell').filter({ hasText: /^ab$/ }).click();
  await expect(page.getByTestId('trace-memory')).toContainText('Tape');
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');
  await expect(page.getByTestId('trace-memory').locator('.cellx.is-head')).toHaveCount(1);
});

test('undo and redo walk the edit history', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await expect(page.getByTestId('undo')).toBeDisabled();

  await page.getByTestId('add-state').click();
  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await page.getByTestId('add-state').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.getByTestId('undo').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
});

test('connect mode draws a self loop and opens its rule', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await page.getByTestId('add-state').click();
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('canvas-hint')).toContainText('tap a state, then tap another');

  const state = page.getByRole('button', { name: /^State q0/ });
  await state.click();
  await state.click();

  await expect(page.getByTestId('rule-head')).toHaveText('q0 → q0');
  await page.getByTestId('rule-commit').click();
  await expect(page.getByRole('button', { name: /δ\(q0, 0\) = q0/ })).toBeVisible();
});

test('a machine that is not a DFA is reported rather than simulated', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await page.getByTestId('add-state').click();
  await page.getByTestId('add-state').click();
  await page.getByTestId('connect').click();

  const q0 = page.getByRole('button', { name: /^State q0/ });
  const q1 = page.getByRole('button', { name: /^State q1/ });

  // Two arrows out of q0 on the same symbol, which no DFA is allowed.
  for (const target of [q0, q1]) {
    await q0.click();
    await target.click();
    await page.getByTestId('rule-commit').click();
  }

  await expect(page.getByTestId('suite-verdict')).toHaveText('Not a machine yet');
  await expect(page.getByTestId('suite-detail')).toContainText(/deterministic/i);
});

test('the level sheet carries the language, a grammar and your machine', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');
  await page.getByTestId('notes').click();

  const sheet = page.getByTestId('level-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('L = { anbncn : n ≥ 0 }')).toBeVisible();

  await page.getByTestId('tab-grammar').click();
  await expect(sheet.getByText('S → ε | aBC | aSBC')).toBeVisible();
  await expect(sheet.getByText('CB → BC', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Chomsky type 1')).toBeVisible();

  await page.getByTestId('tab-machine').click();
  await expect(sheet.getByText('The diagram in words')).toBeVisible();
  await expect(sheet.getByText(/6 states: q0, q1, q2, q3, q4, qa/)).toBeVisible();
});

test('the analysis sheet holds minimality, determinisation and a regex', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByTestId('analyse').click();

  const sheet = page.getByTestId('analysis-sheet');
  await expect(sheet.getByTestId('minimal-verdict')).toContainText('Minimal.');

  await page.getByTestId('tab-regex').click();
  await expect(sheet.getByTestId('regex-source')).toHaveText('0*1(1|00*1)*');

  await page.getByTestId('tab-subset').click();
  await expect(sheet.getByTestId('subset-table')).toBeVisible();
});

test('analysis declines rather than guessing when a view does not apply', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await page.getByTestId('analyse').click();
  await expect(page.getByTestId('analysis-declined')).toContainText('regular languages');

  await page.getByTestId('tab-minimal').click();
  await expect(page.getByTestId('analysis-declined')).toContainText('deterministic finite automata');
});

test('the diagram grows its visible region to the card it is given', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const svg = page.getByTestId('diagram');

  const wide = await svg.getAttribute('viewBox');
  await page.setViewportSize({ width: 420, height: 900 });
  await expect
    .poll(async () => svg.getAttribute('viewBox'), { timeout: 5000 })
    .not.toBe(wide);

  // The logical canvas stays centred in whatever region is on show.
  const narrow = (await svg.getAttribute('viewBox')) ?? '';
  const [x, y, w, h] = narrow.split(' ').map(Number) as [number, number, number, number];
  expect(x + w / 2).toBeCloseTo(170, 1);
  expect(y + h / 2).toBeCloseTo(230, 1);
});

test('a state drags to a new position and commits once', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const state = page.getByRole('button', { name: /^State q0/ });
  // page.mouse works in viewport coordinates and does not scroll, and on a
  // phone the reveal button sits below the diagram.
  await state.scrollIntoViewIfNeeded();
  const before = await state.boundingBox();
  if (!before) throw new Error('no state');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, {
    steps: 10,
  });
  await page.mouse.up();

  const after = await state.boundingBox();
  if (!after) throw new Error('no state');
  expect(after.x).toBeGreaterThan(before.x + 30);

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
