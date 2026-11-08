import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../src/engine/levels';

/**
 * The climb, which is the home screen, and the crossings between its floors.
 */

const ORDER = [...LEVELS].sort((a, b) => a.index - b.index).map((l) => l.id);
const idAt = (index: number): string => ORDER[index - 1] ?? '';
const stop = (page: Page, index: number) =>
  page.locator(`[data-testid="level-row"][data-level="${idAt(index)}"]`);

/**
 * Start with the first `through` levels solved. Written once, before the app
 * loads: a reload would otherwise flush the app's own copy over it.
 */
async function seed(
  page: Page,
  through: number,
  extra: { crossed?: string[]; motion?: 'reduce' | 'full' } = {},
): Promise<void> {
  await page.addInitScript(
    ({ solved, crossed, motion }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'automata-k.progress.v1',
        JSON.stringify({ solved, shownSolution: [], bestStates: {}, crossed }),
      );
      if (motion) localStorage.setItem('automata-k.motion.v1', JSON.stringify(motion));
    },
    { solved: ORDER.slice(0, through), crossed: extra.crossed ?? [], motion: extra.motion },
  );
  await page.goto('/');
  await expect(page.getByTestId('home-view')).toBeVisible();
}

test('the climb is the forty-two levels, in order, as real buttons', async ({ page }) => {
  await page.goto('/');
  const stops = page.getByTestId('level-row');
  await expect(stops).toHaveCount(LEVELS.length);
  expect(await stops.evaluateAll((n) => n.map((b) => (b as HTMLElement).dataset.level))).toEqual(
    ORDER,
  );
  // Each says what it is, for a screen reader as much as for a finger.
  await expect(stop(page, 1)).toHaveAccessibleName('Level 1, Last symbol. par 2.');
  await expect(stop(page, 2)).toHaveAccessibleName(/^Level 2, .*\. Locked\.$/);
  // Nothing on the map may push the page sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the panel shows the next level, and enters it', async ({ page }) => {
  await seed(page, 3);
  const panel = page.getByTestId('climb-panel');
  await expect(panel).toHaveAttribute('data-state', 'next');
  await expect(panel).toContainText(LEVELS.find((l) => l.index === 4)?.title ?? '');
  await expect(page.getByTestId('climb-enter')).toHaveText('Continue');
  await page.getByTestId('climb-enter').click();
  await expect(page).toHaveURL(new RegExp(`#/level/${idAt(4)}$`));
  await expect(page.getByTestId('stage')).toBeVisible();
});

test('pointing at a stop describes it, locked or not', async ({ page, isMobile, hasTouch }) => {
  test.skip(isMobile || hasTouch, 'hover is a pointer thing');
  await seed(page, 3);
  const panel = page.getByTestId('climb-panel');
  await stop(page, 9).locator('..').hover();
  await expect(panel).toHaveAttribute('data-state', 'locked');
  await expect(panel).toContainText('Locked. It opens once L08 is solved.');
  await expect(page.getByTestId('climb-enter')).toBeDisabled();
  await stop(page, 2).hover();
  await expect(panel).toHaveAttribute('data-state', 'solved');
  await expect(page.getByTestId('climb-enter')).toHaveText('Play again');
  // Moving off the map goes back to the next level.
  await page.getByRole('heading', { name: 'automata-k' }).hover();
  await expect(panel).toHaveAttribute('data-state', 'next');
});

test('one stop takes Tab, and the arrow keys walk the path', async ({ page }) => {
  await seed(page, 3);
  const tabbable = page.locator('[data-testid="level-row"][tabindex="0"]');
  await expect(tabbable).toHaveCount(1);
  await expect(tabbable).toHaveAttribute('data-level', idAt(4));

  await stop(page, 4).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(stop(page, 3)).toBeFocused();
  await expect(page.getByTestId('climb-panel')).toHaveAttribute('data-state', 'solved');
  await page.keyboard.press('Home');
  await expect(stop(page, 1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(stop(page, 4)).toBeFocused();
  // The end of the open path is the end: a locked stop takes no focus.
  await page.keyboard.press('ArrowRight');
  await expect(stop(page, 4)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stage')).toBeVisible();
});

test.describe('with motion', () => {
  // A crossing plays as a scene only where motion is welcome; the test
  // run's default is reduced motion.
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('stepping onto the pushdown floor plays its crossing, once', async ({ page }) => {
    await seed(page, 24, { crossed: ['NFA'] });
    await stop(page, 25).click();
    const crossing = page.getByTestId('crossing');
    await expect(crossing).toBeVisible();
    await expect(crossing).toHaveAttribute('data-kind', 'PDA');
    await expect(page.getByRole('dialog', { name: 'A machine with a stack' })).toBeVisible();
    // Skip goes straight into the level.
    await expect(page.getByTestId('crossing-skip')).toBeFocused();
    await page.getByTestId('crossing-skip').click();
    await expect(page).toHaveURL(new RegExp(`#/level/${idAt(25)}$`));
    await expect(page.getByTestId('stage')).toBeVisible();
    await expect(crossing).toHaveCount(0);

    // Seen once, it does not play again, and survives a reload.
    await page.getByTestId('back').click();
    await page.reload();
    await stop(page, 25).click();
    await expect(page.getByTestId('stage')).toBeVisible();
    await expect(crossing).toHaveCount(0);

    // It can be watched again from the climb, and Escape leaves it. A wide
    // window offers it in the panel; a phone, in a row under the map.
    await page.getByTestId('back').click();
    await stop(page, 25).focus();
    const wide = (page.viewportSize()?.width ?? 0) >= 900;
    const replay = page.getByTestId(wide ? 'replay-crossing' : 'replay-PDA');
    await expect(replay).toBeVisible();
    await expect(page.getByTestId('replay-TM')).toBeHidden();
    await replay.click();
    await expect(crossing).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(crossing).toHaveCount(0);
    await expect(page.getByTestId('home-view')).toBeVisible();
    await expect(replay).toBeFocused();
  });

  test('finishing the last finite level crosses onto the next floor', async ({ page }) => {
    await seed(page, 13);
    await page.goto(`/#/level/${idAt(14)}`);
    await expect(page.getByTestId('stage')).toBeVisible();
    // A link from outside never plays a crossing: this one was typed.
    await expect(page.getByTestId('crossing')).toHaveCount(0);
    const grab = page.getByTestId('pane-grab');
    if (await grab.isVisible()) await grab.click();
    await page.getByTestId('tab-hint').click();
    await page.getByTestId('reveal').click();
    await page.getByTestId('run').click();
    await expect(page.getByTestId('score')).toContainText('All ');
    // The results card offers the next level, and that way runs through the crossing.
    await page.getByTestId('results-next').click();
    await expect(page.getByTestId('crossing')).toHaveAttribute('data-kind', 'NFA');
    await page.getByTestId('crossing-skip').click();
    await expect(page).toHaveURL(new RegExp(`#/level/${idAt(15)}$`));
  });
});

test('with reduced motion the crossing is all there at once', async ({ page }) => {
  await seed(page, 36, { crossed: ['NFA', 'PDA'], motion: 'reduce' });
  await stop(page, 37).click();
  const onward = page.getByTestId('crossing-continue');
  await expect(onward).toBeVisible();
  await expect(onward).toBeFocused();
  await expect(onward).toHaveText('Enter level 37');
  await expect(page.getByTestId('crossing')).toContainText('this is a Turing machine');
  await onward.click();
  await expect(page).toHaveURL(new RegExp(`#/level/${idAt(37)}$`));
});

test('a link to a level on a new floor opens the level, not a crossing', async ({ page }) => {
  await page.goto(`/#/level/${idAt(25)}`);
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('crossing')).toHaveCount(0);
});
