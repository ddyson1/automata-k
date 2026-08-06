import { expect, test, type Page } from '@playwright/test';

/**
 * Section 9: one end-to-end smoke test per platform. Open level 1, take the
 * worked solution, run the checks, watch the marks in the brief turn, and
 * confirm progress survives a reload.
 */

const openLevelOne = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'automata-k' })).toBeVisible();
  await page.getByTestId('level-row').filter({ hasText: 'Last symbol' }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
};

const reveal = async (page: Page): Promise<void> => {
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal').click();
  // The solution is on the canvas but nothing is graded until it is asked for.
  await expect(page.getByTestId('score')).toHaveText('Not checked yet');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');
};

test('open level 1, take the solution, the marks in the brief turn', async ({ page }) => {
  await openLevelOne(page);

  // Nothing drawn: the brief states the level rather than failing it.
  await expect(page.getByTestId('empty-prompt')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('Nothing drawn yet');
  await expect(page.getByTestId('goal')).toHaveText('Accept exactly the strings that end with 1.');
  await expect(page.getByTestId('accept-list').getByTestId('verdict')).toHaveCount(6);
  await expect(page.getByTestId('reject-list').getByTestId('verdict')).toHaveCount(6);
  await expect(page.locator('.verdict.is-off')).toHaveCount(0);

  await reveal(page);

  await expect(page.getByTestId('empty-prompt')).toBeHidden();
  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  // No dock: the verdict lives in the same list the level was stated in, and
  // the only control is the one that asks for it.
  await expect(page.getByTestId('dock')).toHaveCount(0);
  await expect(page.getByTestId('why')).toHaveText('2 states, par 2.');
});

test('progress survives a reload', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);

  await page.reload();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');

  await page.getByTestId('back').click();
  await expect(page.getByTestId('solved-count')).toHaveText(/^1\/\d+$/);
  await expect(
    page.locator('[data-testid="level-row"][data-level="dfa-even-zeros"]'),
  ).toBeEnabled();
});

test('the machine tab highlights both ways', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);
  await page.getByTestId('tab-machine').click();

  await expect(page.getByTestId('panel')).toBeVisible();
  // The level line and the verdict stay put while the machine is on show.
  await expect(page.getByTestId('score')).toBeVisible();
  await expect(page.getByTestId('delta-signature')).toHaveText('δ : Q × Σ → Q');
  await expect(page.getByTestId('delta-note')).toHaveText('δ is total: all 4 pairs defined.');
  await expect(page.getByTestId('delta-list').getByRole('listitem')).toHaveCount(4);

  // Pointing at a rule lights the arrow it came from.
  await page.getByRole('button', { name: /δ\(q0, 1\) = q1/ }).hover();
  await expect(page.locator('.chip.is-lit')).toHaveCount(1);

  // Back to the brief: the tabs are the pane's own, so there is nothing to close.
  await page.getByTestId('tab-brief').click();
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page.getByTestId('brief')).toBeVisible();
});

test('a failing machine crosses the strings it gets wrong', async ({ page }) => {
  await openLevelOne(page);

  const canvas = page.getByTestId('diagram');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await canvas.dblclick({ position: { x: box.width * 0.5, y: box.height * 0.4 } });
  await page.getByTestId('toggle-accepting').click();

  // Nothing is crossed until the checks are asked for.
  await expect(page.locator('.verdict.is-off')).toHaveCount(0);
  await page.getByTestId('run').click();

  await expect(page.getByTestId('why')).toContainText('Shortest disagreement');
  await expect(page.locator('.verdict.is-off').first()).toBeVisible();
});
