import { expect, test, type Page } from '@playwright/test';

/**
 * The level as a chamber: the question and the instruments in its corners,
 * the console on the right, the suite played through the machine, and the
 * card a passing run ends on.
 */

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('stage')).toBeVisible();
}

/** Put the worked solution on the canvas, from the console's Stuck tab. */
async function reveal(page: Page): Promise<void> {
  const grab = page.getByTestId('pane-grab');
  if (await grab.isVisible()) await grab.click();
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal').click();
}

test('the chamber says which level, how it measures up, and the way back', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await expect(page.getByTestId('kicker')).toHaveText('L01 · Last symbol · finite');
  await expect(page.getByTestId('goal')).toHaveText('Accept exactly the strings that end with 1.');
  await expect(page.getByTestId('meter')).toHaveText('States 0 / par 2 · arrows 0');

  await reveal(page);
  await expect(page.getByTestId('meter')).toContainText('States 2 / par 2');

  // The console's first tab is the suite; the strings are its rows.
  await expect(page.getByTestId('tab-brief')).toHaveText('Suite');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('home-view')).toBeVisible();
});

test('with reduced motion a run simply marks the suite and opens the card', async ({ page }) => {
  await open(page, 'dfa-ends-in-1');
  await reveal(page);
  await page.getByTestId('run').click();
  await expect(page.getByTestId('score')).toHaveText('All 12 agree');
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('results-stats')).toContainText('par');
  // Escape is the dialog's own way out.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('results')).toBeHidden();
  await expect(page.locator('.verdict.is-off')).toHaveCount(0);
});

test.describe('with motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('running the suite plays every string through the machine', async ({ page }) => {
    await open(page, 'dfa-ends-in-1');
    await reveal(page);
    await page.getByTestId('run').click();

    // One row at a time, with the string in the readout.
    await expect(page.getByTestId('score')).toHaveText(/^Running \d+ of 12$/);
    await expect(page.locator('.verdict.is-running')).toHaveCount(1);
    await expect(page.getByTestId('trace')).toBeVisible();
    await expect(page.getByTestId('trace-caption')).toHaveText(/^running \d+ of 12$/);
    await expect(page.getByTestId('run')).toBeDisabled();

    // And it ends on the card, with every row ticked behind it.
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('results-verdict')).toHaveText('Minimal.');
    await page.getByTestId('results-stay').click();
    await expect(page.getByTestId('score')).toHaveText('All 12 agree');
    await expect(page.locator('.verdict.is-running')).toHaveCount(0);
    await expect(page.getByTestId('trace')).toBeHidden();
  });

  test('Escape stops the show, and the verdict it was showing stands', async ({ page }) => {
    await open(page, 'dfa-ends-in-1');
    await reveal(page);
    await page.getByTestId('run').click();
    await expect(page.getByTestId('score')).toHaveText(/^Running/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('score')).toHaveText('All 12 agree');
    await expect(page.getByTestId('trace')).toBeHidden();
    // Stopped short, it is a verdict and not a celebration.
    await expect(page.getByTestId('results')).toBeHidden();
  });
});
