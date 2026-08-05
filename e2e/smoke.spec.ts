import { expect, test, type Page } from '@playwright/test';

/**
 * Section 9: one end-to-end smoke test per platform. Open level 1, reveal the
 * worked solution, watch the live suite go green, and confirm progress survives
 * a reload.
 */

const openLevelOne = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'automata-k' })).toBeVisible();
  await page.getByTestId('level-row').filter({ hasText: 'Last symbol' }).click();
  await expect(page.getByTestId('diagram-card')).toBeVisible();
};

const reveal = async (page: Page): Promise<void> => {
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('suite-verdict')).toHaveText('Every test passes');
};

test('open level 1, reveal the solution, the live suite turns green', async ({ page }) => {
  await openLevelOne(page);

  // Nothing drawn, so the suite states the tests rather than failing them.
  await expect(page.getByTestId('suite')).toBeVisible();
  await expect(page.getByTestId('suite-detail')).toContainText('Add a state to begin');
  await expect(page.getByTestId('suite-score')).toHaveText('0/12');

  await reveal(page);

  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  // No Run button anywhere: grading is continuous.
  await expect(page.getByRole('button', { name: 'Run tests' })).toHaveCount(0);
  await expect(page.getByTestId('suite-score')).toHaveText('12/12');
  await expect(page.getByText(/Solved with 2 states, par 2/)).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);

  await page.reload();
  await expect(page.getByTestId('diagram-card')).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
  await expect(page.getByTestId('suite-score')).toHaveText('12/12');

  await page.getByTestId('back').click();
  await expect(page.getByTestId('solved-count')).toHaveText('1/12');
  await expect(page.getByTestId('level-row').filter({ hasText: 'Parity' })).toBeEnabled();
});

test('the ledger is permanent and highlights both ways', async ({ page }) => {
  await openLevelOne(page);
  await reveal(page);

  // No toggle on delta: it is always on screen.
  await expect(page.getByTestId('delta-signature')).toHaveText('δ : Q × Σ → Q');
  await expect(page.getByTestId('delta-note')).toHaveText('δ is total: all 4 pairs defined.');
  await expect(page.getByTestId('delta-list').getByRole('listitem')).toHaveCount(4);

  // Hovering a rule lights the arrow it came from.
  const rule = page.getByRole('button', { name: /δ\(q0, 1\) = q1/ });
  await rule.hover();
  await expect(page.locator('.chip.is-lit')).toHaveCount(1);

  // Selecting the arrow lights the rule.
  await page.keyboard.press('Escape');
  await page.locator('.chip').filter({ hasText: /^1$/ }).first().click();
  await expect(page.getByTestId('rule-sheet')).toBeVisible();
  await page.getByTestId('rule-sheet').getByLabel('Close').click();
  await expect(page.locator('.delta-line.is-lit')).toHaveCount(1);
});

test('a failing machine names the shortest disagreement', async ({ page }) => {
  await openLevelOne(page);

  await page.getByTestId('add-state').click();
  await page.getByTestId('toggle-accepting').click();

  await expect(page.getByTestId('suite-detail')).toContainText('Shortest disagreement');
});
