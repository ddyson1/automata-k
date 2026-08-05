import { expect, test, type Page } from '@playwright/test';

/**
 * Section 9: one end-to-end smoke test per platform. Open level 1, reveal the
 * solution, watch the live suite go green, and confirm progress survives a
 * reload.
 */

const openLevelOne = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByText('automata-k')).toBeVisible();
  await page.getByTestId('level-dfa-ends-in-1').click();
  await expect(page.getByTestId('canvas-card')).toBeVisible();
};

const reveal = async (page: Page) => {
  await page.getByTestId('notes').click();
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal-solution').click();
  await expect(page.getByTestId('level-sheet')).toBeHidden();
};

test('open level 1, reveal the solution, the live suite turns green', async ({ page }) => {
  await openLevelOne(page);

  // Nothing drawn, so the suite withholds a verdict rather than showing red.
  await expect(page.getByTestId('suite-strip')).toBeVisible();
  await expect(page.getByText('NOTHING DRAWN')).toBeVisible();

  await reveal(page);

  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  // No Run button anywhere: grading is continuous.
  await expect(page.getByRole('button', { name: 'Run tests' })).toHaveCount(0);
  await expect(page.getByText('ALL PASSING')).toBeVisible();
  await expect(page.getByText(/Solved with 2 states, par 2/)).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);
  await expect(page.getByText('ALL PASSING')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('canvas-card')).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('1 of 12 solved')).toBeVisible();
  await expect(page.getByTestId('level-dfa-even-zeros')).toBeEnabled();
});

test('the ledger is permanent and highlights both ways', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);

  // No toggle: delta is always on screen.
  await expect(page.getByText('δ : Q × Σ → Q')).toBeVisible();
  await expect(page.getByText('4 OF 4 DEFINED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'δ(q0, 1) = q1' })).toBeVisible();

  // Tapping a rule selects and centres its arrow.
  await page.getByRole('button', { name: 'δ(q0, 1) = q1' }).click();
  await expect(page.getByRole('button', { name: 'Arrow labelled 1' }).first()).toBeVisible();
});

test('a failing machine names the shortest disagreement', async ({ page }) => {
  await openLevelOne(page);

  await page.getByTestId('add-state').click();
  await page.getByRole('button', { name: 'Make accepting' }).click();

  await expect(page.getByTestId('counterexample')).toBeVisible();
  await expect(page.getByText(/Shortest disagreement/)).toBeVisible();
});
