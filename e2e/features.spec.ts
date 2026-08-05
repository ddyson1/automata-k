import { expect, test, type Page } from '@playwright/test';

/** Reveal a level's verified solution and land back on the canvas. */
async function reveal(page: Page, levelId: string) {
  await page.goto(`/level/${levelId}`);
  await expect(page.getByTestId('canvas-card')).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByTestId('reveal-solution').click();
  await expect(page.getByTestId('hint-sheet')).toBeHidden();
}

test('the trace player steps through a run and shows the stack on a PDA', async ({ page }) => {
  await reveal(page, 'pda-an-bn');
  await page.getByTestId('run-tests').click();
  await expect(page.getByTestId('results-sheet')).toBeVisible();

  await page.getByRole('button', { name: /^aabb, language says accept/ }).click();
  await expect(page.getByTestId('canvas-card').getByText('TRACE')).toBeVisible();
  await expect(page.getByTestId('canvas-card').getByText('STACK')).toBeVisible();
  await expect(page.getByTestId('canvas-card').getByText('accepted')).toBeVisible();

  // Step forward and the counter moves with it.
  await expect(page.getByTestId('canvas-card').getByText(/^1\/\d+$/)).toBeVisible();
  await page.getByTestId('canvas-card').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('canvas-card').getByText(/^2\/\d+$/)).toBeVisible();
  await page.getByTestId('canvas-card').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('canvas-card').getByText(/^1\/\d+$/)).toBeVisible();
});

test('the trace player shows the tape and head on a Turing machine', async ({ page }) => {
  await reveal(page, 'tm-an-bn');
  await page.getByTestId('run-tests').click();
  await page.getByRole('button', { name: /^ab, language says accept/ }).click();
  await expect(page.getByTestId('canvas-card').getByText('TAPE')).toBeVisible();
  await expect(page.getByTestId('canvas-card').getByText('accepted')).toBeVisible();
});

test('undo and redo walk the edit history', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await expect(page.getByTestId('canvas-card')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add state' }).click();
  await expect(page.getByRole('button', { name: /^State q0/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add state' }).click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeHidden();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: /^State q1/ })).toBeVisible();
});

test('connect mode draws an arrow and a self loop', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await page.getByRole('button', { name: 'Add state' }).click();
  await page.getByTestId('connect-toggle').click();
  await expect(page.getByText(/Tap a target state/)).toBeVisible();

  // Tapping the source itself is the self loop gesture.
  await page.getByRole('button', { name: /^State q0/ }).click();
  await expect(page.getByTestId('transition-sheet')).toBeVisible();
  await expect(page.getByText('q0 to q0')).toBeVisible();
});

test('the regex view converts the machine by state elimination', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByRole('button', { name: 'Show the formal readout' }).click();
  await page.getByRole('button', { name: 'Regex view of this machine' }).click();

  await expect(page.getByTestId('analysis-sheet')).toBeVisible();
  await expect(page.getByText('Regular expression')).toBeVisible();
  // Every string ending in 1, as state elimination writes it.
  await expect(page.getByTestId('analysis-sheet').getByText('0*1(1|00*1)*')).toBeVisible();
});

test('the subset construction view determinises an NFA state by state', async ({ page }) => {
  await reveal(page, 'nfa-third-last-1');
  await page.getByRole('button', { name: 'Show the formal readout' }).click();
  await page.getByRole('button', { name: 'Subsets view of this machine' }).click();

  await expect(page.getByTestId('analysis-sheet')).toBeVisible();
  // The classic result: third from the end needs eight deterministic states.
  await expect(page.getByText('Determinised: 8 subsets')).toBeVisible();
});

test('the diagram has a text alternative driven by the delta list', async ({ page }) => {
  await reveal(page, 'dfa-ends-in-1');
  await page.getByRole('button', { name: 'Show the formal readout' }).click();
  await page.getByRole('button', { name: 'Text view of this machine' }).click();

  await expect(page.getByText('The diagram in words')).toBeVisible();
  await expect(page.getByText(/2 states: q0, q1\. Start state q0\./)).toBeVisible();
  await expect(page.getByText(/From q0 to q1, reading 1\./)).toBeVisible();
});

test('a machine that is not a DFA is reported rather than simulated', async ({ page }) => {
  await page.goto('/level/dfa-ends-in-1');
  await page.getByRole('button', { name: 'Add state' }).click();

  // Two arrows out of q0 on the same symbol.
  await page.getByTestId('connect-toggle').click();
  await page.getByRole('button', { name: /^State q0/ }).click();
  await page.getByRole('button', { name: 'Add another rule' }).click();

  // Backdrop tap to close, which section 7 asks every sheet to support. Tap
  // near the top so the point is backdrop on a phone viewport too.
  const box = page.viewportSize();
  await page.mouse.click((box?.width ?? 400) / 2, 30);
  await expect(page.getByTestId('transition-sheet')).toBeHidden();

  await expect(page.getByText(/A deterministic machine allows only one/)).toBeVisible();
});

test('level notes carry the language, a grammar and the class definition', async ({ page }) => {
  await page.goto('/level/tm-an-bn-cn');
  await page.getByTestId('dock').getByRole('button', { name: 'Notes', exact: true }).click();

  await expect(page.getByTestId('notes-sheet')).toBeVisible();
  await expect(page.getByText('L = { aⁿbⁿcⁿ : n ≥ 0 }')).toBeVisible();
  await expect(page.getByText('S → ε | aBC | aSBC')).toBeVisible();
  await expect(page.getByTestId('notes-sheet').getByText('CB → BC', { exact: true })).toBeVisible();
  await expect(page.getByText('Chomsky type 1')).toBeVisible();
  await expect(page.getByTestId('notes-sheet').getByText(/Turing machine/).first()).toBeVisible();
});

test('locked levels stay locked until the one before them is solved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('level-dfa-ends-in-1')).toBeEnabled();
  await expect(page.getByTestId('level-dfa-even-zeros')).toBeDisabled();
  await expect(page.getByTestId('level-tm-an-bn-cn')).toBeDisabled();
});
