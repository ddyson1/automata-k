import { expect, test, type Page } from '@playwright/test';

/** Reveal a level's verified solution and land back on the canvas. */
async function reveal(page: Page, levelId: string) {
  await page.goto(`/level/${levelId}`);
  await expect(page.getByTestId('canvas-card')).toBeVisible();
  await page.getByTestId('notes').click();
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal-solution').click();
  await expect(page.getByTestId('level-sheet')).toBeHidden();
}

test('the ledger edits a rule in place, with no sheet', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');

  // δ(q0, 1) = q1 currently. Open the row and send it to q0 instead.
  await page.getByRole('button', { name: 'δ(q0, 1) = q1' }).click();
  await expect(page.getByRole('radio', { name: 'To q0' })).toBeVisible();
  await page.getByRole('radio', { name: 'To q0' }).click();

  await expect(page.getByRole('button', { name: 'δ(q0, 1) = q0' })).toBeVisible();
  // The live suite noticed without being asked.
  await expect(page.getByText('ALL PASSING')).toHaveCount(0);
  await expect(page.getByTestId('counterexample')).toBeVisible();
});

test('an unwired pair is listed in red and tapping it writes the rule', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await page.getByTestId('add-state').click();

  await expect(page.getByRole('button', { name: 'δ(q0, 0) = undefined' })).toBeVisible();
  await expect(page.getByText('0 OF 2 DEFINED')).toBeVisible();

  await page.getByRole('button', { name: 'δ(q0, 0) = undefined' }).click();
  await expect(page.getByRole('button', { name: 'δ(q0, 0) = q0' })).toBeVisible();
  await expect(page.getByText('1 OF 2 DEFINED')).toBeVisible();
});

test('grading is live: the strip recolours as the machine changes', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await expect(page.getByText('ALL PASSING')).toBeVisible();

  // Un-accept the accepting state; the suite goes red without being asked.
  await page.getByRole('button', { name: /^State q1/ }).click();
  await page.getByRole('button', { name: 'Accepting', exact: true }).click();
  await expect(page.getByText(/FAILING$/)).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('ALL PASSING')).toBeVisible();
});

test('tapping a test plays its trace between the panes', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await page.getByTestId('test-aabb').click();

  await expect(page.getByTestId('trace-band')).toBeVisible();
  await expect(page.getByTestId('trace-band').getByText('STACK')).toBeVisible();
  await expect(page.getByTestId('trace-band').getByText('ACCEPTED')).toBeVisible();

  await expect(page.getByTestId('trace-band').getByText(/^1\/\d+$/)).toBeVisible();
  await page.getByTestId('trace-band').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('trace-band').getByText(/^2\/\d+$/)).toBeVisible();
});

test('a Turing machine trace shows the tape and the head', async ({ page }) => {
  await reveal(page, 'tm-an-bn');
  await page.getByTestId('test-ab').click();
  await expect(page.getByTestId('trace-band').getByText('TAPE')).toBeVisible();
  await expect(page.getByTestId('trace-band').getByText('ACCEPTED')).toBeVisible();
});

test('undo and redo walk the edit history', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await page.getByTestId('add-state').click();
  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await page.getByTestId('add-state').click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeHidden();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
});

test('connect mode draws a self loop and opens its rule', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await page.getByTestId('add-state').click();
  await page.getByTestId('connect-toggle').click();
  await expect(page.getByText(/Tap a target state/)).toBeVisible();

  await page.getByRole('button', { name: /^State q0/ }).click();
  await expect(page.getByRole('button', { name: 'δ(q0, 0) = q0' })).toBeVisible();
});

test('a machine that is not a DFA is reported rather than simulated', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await page.getByTestId('add-state').click();

  // Two rules out of q0 on the same symbol.
  await page.getByRole('button', { name: 'δ(q0, 0) = undefined' }).click();
  await page.getByTestId('add-rule').click();

  await expect(page.getByText(/A deterministic machine allows only one/)).toBeVisible();
  await expect(page.getByText('NOT A MACHINE YET')).toBeVisible();
});

test('the level sheet carries the language, a grammar and your machine', async ({ page }) => {
  await reveal(page, 'tm-an-bn-cn');
  await page.getByTestId('notes').click();

  await expect(page.getByTestId('level-sheet')).toBeVisible();
  await expect(page.getByText('L = { aⁿbⁿcⁿ : n ≥ 0 }')).toBeVisible();
  await expect(page.getByText('S → ε | aBC | aSBC')).toBeVisible();
  await expect(page.getByTestId('level-sheet').getByText('CB → BC', { exact: true })).toBeVisible();
  await expect(page.getByText('Chomsky type 1')).toBeVisible();

  await page.getByTestId('tab-machine').click();
  await expect(page.getByText('The diagram in words')).toBeVisible();
  await expect(page.getByText(/6 states: q0, q1, q2, q3, q4, qa/)).toBeVisible();
});

test('the regex and subset views live in the same sheet', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByTestId('notes').click();
  await page.getByTestId('tab-machine').click();
  await expect(page.getByText('0*1(1|00*1)*')).toBeVisible();
  await expect(page.getByText('Already minimal')).toBeVisible();

  await reveal(page, 'nfa-third-last-1');
  await page.getByTestId('notes').click();
  await page.getByTestId('tab-machine').click();
  await expect(page.getByText('Determinised: 8 subsets')).toBeVisible();
});

test('the diagram pane resizes and the ledger keeps its place', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  const before = await page.getByTestId('canvas-card').boundingBox();
  const grip = await page.getByTestId('divider').boundingBox();
  if (!grip || !before) throw new Error('no layout');

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y - 90, { steps: 8 });
  await page.mouse.up();

  const after = await page.getByTestId('canvas-card').boundingBox();
  if (!after) throw new Error('no layout');
  expect(after.height).toBeLessThan(before.height - 40);
  await expect(page.getByRole('button', { name: 'δ(q0, 1) = q1' })).toBeVisible();
});

test('locked levels stay locked until the one before them is solved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('level-dfa-ends-in-1')).toBeEnabled();
  await expect(page.getByTestId('level-dfa-even-zeros')).toBeDisabled();
  await expect(page.getByTestId('level-tm-an-bn-cn')).toBeDisabled();
});
