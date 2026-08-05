import { expect, test, type Page } from '@playwright/test';

/**
 * Section 9: one end-to-end smoke test per platform. Open level 1, reveal the
 * solution, run the tests, see the win sheet, and confirm progress survives a
 * reload.
 */

const openLevelOne = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByText('Automata Lab')).toBeVisible();
  await page.getByTestId('level-dfa-ends-in-1').click();
  await expect(page.getByTestId('canvas-card')).toBeVisible();
};

test('open level 1, reveal the solution, run the tests, win', async ({ page }) => {
  await openLevelOne(page);

  // Nothing drawn yet, so the grader has nothing to run.
  await expect(page.getByTestId('run-tests')).toBeDisabled();

  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByTestId('hint-sheet')).toBeVisible();
  await page.getByTestId('reveal-solution').click();

  // The revealed machine is the verified two state solution.
  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.getByTestId('run-tests').click();
  await expect(page.getByTestId('results-sheet')).toBeVisible();
  await expect(page.getByText('Solved', { exact: true })).toBeVisible();
  await expect(page.getByText('This is the smallest DFA for the language.')).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  await openLevelOne(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByTestId('reveal-solution').click();
  await page.getByTestId('run-tests').click();
  await expect(page.getByTestId('results-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'Keep building' }).click();

  await page.reload();
  await expect(page.getByTestId('canvas-card')).toBeVisible();
  // The drawn machine came back with the page.
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('1 of 12 solved')).toBeVisible();
  // Level 2 unlocked because level 1 is solved.
  await expect(page.getByTestId('level-dfa-even-zeros')).toBeEnabled();
});

test('the formal readout tracks the machine and highlights both ways', async ({ page }) => {
  await openLevelOne(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByTestId('reveal-solution').click();

  await page.getByRole('button', { name: 'Show the formal readout' }).click();
  await expect(page.getByText('= {q0, q1}')).toBeVisible();
  await expect(page.getByText('δ(q0, 1) = q1')).toBeVisible();
  await expect(page.getByText('δ is total: all 4 pairs defined.')).toBeVisible();

  // Tapping a delta line selects its arrow.
  await page.getByRole('button', { name: 'δ(q0, 1) = q1' }).click();
  await expect(page.getByRole('button', { name: 'Arrow labelled 1' }).first()).toBeVisible();
});

test('a failing machine reports a counterexample rather than only a failing row', async ({
  page,
}) => {
  await openLevelOne(page);

  // One accepting state that loops on nothing: accepts only the empty string.
  await page.getByRole('button', { name: 'Add state' }).click();
  await page.getByRole('button', { name: 'Make accepting' }).click();
  await page.getByTestId('run-tests').click();

  await expect(page.getByTestId('results-sheet')).toBeVisible();
  await expect(page.getByText(/Shortest disagreement/)).toBeVisible();
});
