import { expect, test, type Page } from '@playwright/test';

/**
 * The Learn floor: six lessons before level 1, the coach that talks you
 * through them, and predict-then-run, which the lessons teach and the levels
 * keep doing.
 *
 * The run's default is reduced motion, so a fed symbol, a guess and a run of
 * the suite each land at once.
 */

const line = (page: Page) => page.getByTestId('coach-line');
const badge = (page: Page) => page.getByTestId('coach-badge');

/** Drag from one state's grip onto another, or back onto itself for a loop. */
async function drawArrow(page: Page, fromLabel: string, toLabel: string): Promise<void> {
  const from = page.getByRole('button', { name: new RegExp(`^State ${fromLabel}`) });
  await from.hover();
  const grip = from.locator('.state-grip').first();
  const gripBox = await grip.boundingBox();
  const to = page.getByRole('button', { name: new RegExp(`^State ${toLabel}`) });
  const target = await to.boundingBox();
  if (!gripBox || !target) throw new Error('no grip or target');
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
}

/** Draw an arrow and add its rule, for `symbol` whatever the editor offered first. */
async function addRule(page: Page, from: string, to: string, symbol: string): Promise<void> {
  await drawArrow(page, from, to);
  await page.locator(`[data-testid="field-read"] [data-value="${symbol}"]`).click();
  await page.getByTestId('rule-commit').click();
  await expect(page.getByTestId('rule-sheet')).toBeHidden();
}

/** Place a state at a fraction of the canvas, so it lands on any viewport. */
async function place(page: Page, fx: number, fy: number): Promise<void> {
  const canvas = page.getByTestId('diagram');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await canvas.dblclick({ position: { x: box.width * fx, y: box.height * fy } });
}

/**
 * Place a state clear of another one. On a phone the coach takes the top of
 * the screen and the canvas is short, so a fixed fraction of it can land on a
 * state already there or off the canvas; distance from that state, inside the
 * canvas, is what is wanted.
 */
async function placeBelow(page: Page, label: string): Promise<void> {
  const ring = await page
    .getByRole('button', { name: new RegExp(`^State ${label}`) })
    .locator('.state-ring')
    .boundingBox();
  const canvas = await page.getByTestId('diagram').boundingBox();
  if (!ring || !canvas) throw new Error(`no state ${label}`);
  const below = ring.y + ring.height * 2.2;
  const lowest = canvas.y + canvas.height - ring.height * 0.7;
  // Below if there is room; otherwise down and to the left, still clear of it.
  const y = Math.min(below, lowest);
  const x = y < below ? ring.x - ring.width * 0.2 : ring.x + ring.width / 2;
  await page.mouse.dblclick(Math.max(ring.width * 0.6, x), y);
}

/** Open the console where it is a bar, so the suite's rows can be tapped. */
async function openPane(page: Page): Promise<void> {
  const grab = page.getByTestId('pane-grab');
  if (!(await grab.isVisible())) return;
  if (await page.getByTestId('pane').evaluate((el) => el.classList.contains('is-open'))) return;
  await grab.click();
}

/** Put a level's worked solution on the canvas without running it. */
async function takeSolution(page: Page, levelId = 'dfa-ends-in-1'): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await openPane(page);
  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal').click();
  await openPane(page);
  await page.getByTestId('tab-brief').click();
}

test('a new player is pointed at the first lesson, and level 1 stays open', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByTestId('climb-panel');
  await expect(panel).toHaveAttribute('data-state', 'next');
  await expect(panel).toContainText('Reading');
  await expect(page.getByTestId('climb-enter')).toHaveText('Start');
  await expect(page.getByTestId('lesson-row')).toHaveCount(6);
  const first = page.locator('[data-testid="lesson-row"][data-lesson="lesson-reading"]');
  await expect(first).toHaveAccessibleName('Lesson 1, Reading. Start here.');
  await expect(first).toHaveAttribute('tabindex', '0');
  await expect(page.locator('[data-testid="level-row"][data-level="dfa-ends-in-1"]')).toBeEnabled();
  await page.getByTestId('climb-enter').click();
  await expect(page).toHaveURL(/#\/lesson\/lesson-reading$/);
  await expect(page.getByTestId('lesson-view')).toBeVisible();
});

test('anyone who knows can skip straight to level 1', async ({ page }) => {
  await page.goto('/');
  const skip = page.getByTestId('skip-lessons');
  // A phone's bar keeps only the name and the button; level 1 is a tap away on the map.
  test.skip(!(await skip.isVisible()), 'the wide panel offers the skip');
  await skip.click();
  await expect(page).toHaveURL(/#\/level\/dfa-ends-in-1$/);
});

test('lesson 1: feed the machine, call two strings, run the suite', async ({ page }) => {
  await page.goto('/#/lesson/lesson-reading');
  await expect(page.getByTestId('kicker')).toHaveText('Lesson 1 of 6 · Reading');
  await expect(line(page)).toContainText('Press 1');
  // Its suite starts unmarked: running it is one of the steps.
  await expect(page.getByTestId('score')).toHaveText('Not checked yet');

  await page.getByTestId('feed-1').click();
  await expect(page.getByTestId('trace-input')).toHaveText('1');
  await expect(page.getByTestId('trace-caption')).toHaveText(/go to on/);
  await expect(line(page)).toContainText('Now feed it a 0');
  await page.getByTestId('feed-0').click();
  await expect(line(page)).toContainText('Feed it a few more');
  for (const symbol of ['1', '1', '0']) await page.getByTestId(`feed-${symbol}`).click();
  await expect(page.getByTestId('trace-input')).toHaveText('10110');

  await expect(line(page)).toContainText('gives its answer');
  await page.getByTestId('coach-next').click();

  await expect(line(page)).toContainText('0110');
  await page.getByTestId('coach-reject').click();
  await expect(page.getByTestId('trace-remark')).toHaveText(
    'You called it: 0110 is rejected, because it ended in off.',
  );
  await expect(badge(page)).toContainText('You called it');
  await expect(line(page)).toContainText('1011');
  await page.getByTestId('coach-reject').click();
  await expect(badge(page)).toContainText('You said reject, but 1011 is accepted: it ended in on.');

  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach')).toHaveClass(/is-finished/);
  await expect(page.getByTestId('kicker')).toHaveText('Lesson 1 of 6 · Reading · done');
  await expect(page.getByTestId('coach-onward')).toHaveText('Next: Accepting');
  // A lesson is not a level: no results card, no par.
  await expect(page.getByTestId('results')).toBeHidden();

  await page.getByTestId('coach-climb').click();
  const lessonStop = (id: string) =>
    page.locator(`[data-testid="lesson-row"][data-lesson="${id}"]`);
  await expect(lessonStop('lesson-reading')).toHaveClass(/is-solved/);
  // The next lesson is the one that glows now. (The panel follows whatever
  // the pointer rests on, so the stop is what is asserted.)
  await expect(lessonStop('lesson-accepting')).toHaveClass(/is-next/);
});

test('lesson 2: only the double ring is offered, and where it goes decides', async ({ page }) => {
  await page.goto('/#/lesson/lesson-accepting');
  for (const symbol of ['1', '0']) await page.getByTestId(`feed-${symbol}`).click();
  await expect(line(page)).toContainText('Select the state one');
  await expect(page.locator('.state.is-beckon')).toHaveCount(1);

  // Nothing here makes a state.
  const states = page.locator('g.state');
  await expect(states).toHaveCount(3);
  const canvas = page.getByTestId('diagram');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  await canvas.dblclick({ position: { x: box.width * 0.5, y: box.height * 0.8 } });
  await expect(states).toHaveCount(3);

  await page.getByRole('button', { name: /^State one/ }).click();
  await expect(page.getByTestId('toggle-accepting')).toBeVisible();
  for (const id of ['set-start', 'rename', 'delete-state']) {
    await expect(page.getByTestId(id)).toBeHidden();
  }
  await page.getByTestId('toggle-accepting').click();

  await expect(line(page)).toContainText('empty string');
  await page.getByTestId('coach-reject').click();
  await expect(badge(page)).toContainText(
    'You called it: ε is rejected, because it ended in none.',
  );
  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach-onward')).toHaveText('Next: Every symbol goes somewhere');
});

test('lesson 3: a run gets stuck, and the missing arrow fixes it', async ({ page }) => {
  await page.goto('/#/lesson/lesson-arrows');
  await page.getByTestId('coach-accept').click();
  await expect(page.getByTestId('trace-caption')).toHaveText(
    'No arrow from here on 1, so the run stops.',
  );
  await expect(page.getByTestId('trace-remark')).toHaveText(
    'You said accept, but 11 is rejected: it got stuck in odd.',
  );
  await expect(line(page)).toContainText('Draw the missing arrow');

  await page.getByTestId('trace-close').click();
  await drawArrow(page, 'odd', 'even');
  await expect(page.getByTestId('rule-head')).toHaveText('odd → even');
  // A new arrow offers the symbol its state has no arrow for yet.
  await expect(page.locator('[data-testid="field-read"] [aria-checked="true"]')).toHaveText('1');
  await page.getByTestId('rule-commit').click();

  await expect(line(page)).toContainText('11 now');
  await page.getByTestId('coach-accept').click();
  await expect(badge(page)).toContainText(
    'You called it: 11 is accepted, because it ended in even.',
  );
  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach-onward')).toHaveText('Next: A state is a memory');
  await page.getByTestId('coach-onward').click();
  await expect(page).toHaveURL(/#\/lesson\/lesson-memory$/);
});

test('lesson 4: states that mean something, and the arrows that follow', async ({ page }) => {
  await page.goto('/#/lesson/lesson-memory');
  await expect(line(page)).toContainText('from no to yes, for 0');
  await expect(page.locator('g.state.is-beckon')).toHaveCount(1);
  // A wrong symbol is said, and fixed, rather than silently not counted.
  await drawArrow(page, 'no', 'yes');
  await page.locator('[data-testid="field-read"] [data-value="1"]').click();
  await page.getByTestId('rule-commit').click();
  await expect(line(page)).toHaveText('That arrow reads 1. Press its label and change it to 0.');
  await page.getByTestId('undo').click();

  await addRule(page, 'no', 'yes', '0');
  await expect(line(page)).toContainText('loops back');
  await addRule(page, 'yes', 'yes', '0');
  await expect(line(page)).toContainText('both arrows for 1');
  await addRule(page, 'yes', 'no', '1');
  await addRule(page, 'no', 'no', '1');
  await expect(line(page)).toContainText('10');
  await page.getByTestId('coach-accept').click();
  await expect(badge(page)).toContainText(
    'You called it: 10 is accepted, because it ended in yes.',
  );
  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach-onward')).toHaveText('Next: Your own states');
});

test('lesson 5: from an empty canvas to a machine of your own', async ({ page }) => {
  await page.goto('/#/lesson/lesson-own');
  await expect(page.locator('g.state')).toHaveCount(0);
  await expect(line(page)).toContainText('place a state');
  await place(page, 0.3, 0.6);
  await expect(line(page)).toContainText('Place a second one');
  await place(page, 0.62, 0.6);
  await expect(page.locator('g.state')).toHaveCount(2);

  await expect(line(page)).toContainText('press Accepting');
  // The start is the wrong place for the ring, and the coach says why.
  await page.getByRole('button', { name: /^State q0/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await expect(line(page)).toContainText('take its ring off');
  await page.getByTestId('toggle-accepting').click();
  await page.getByRole('button', { name: /^State q1/ }).click();
  await page.getByTestId('toggle-accepting').click();

  await expect(line(page)).toContainText('choose 1');
  await addRule(page, 'q0', 'q1', '1');
  await addRule(page, 'q0', 'q0', '0');
  await expect(line(page)).toContainText('both symbols');
  await addRule(page, 'q1', 'q1', '0');
  await addRule(page, 'q1', 'q1', '1');
  await expect(line(page)).toContainText('000');
  await page.getByTestId('coach-reject').click();
  await expect(badge(page)).toContainText(
    'You called it: 000 is rejected, because it ended in q0.',
  );
  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach-onward')).toHaveText('Next: Trapped');
});

test('lesson 6: a missing arrow is a dead state, made real', async ({ page }) => {
  await page.goto('/#/lesson/lesson-trapped');
  await page.getByTestId('coach-reject').click();
  await expect(badge(page)).toContainText('01 is rejected, because it got stuck in s.');
  await expect(line(page)).toContainText('dead state');
  await page.getByTestId('trace-close').click();

  await placeBelow(page, 's');
  await expect(page.locator('g.state')).toHaveCount(3);
  await expect(line(page)).toContainText('from s to your new state, for 0');
  await addRule(page, 's', 'q0', '0');
  await expect(line(page)).toContainText('never lets go');
  await addRule(page, 'q0', 'q0', '0');
  await addRule(page, 'q0', 'q0', '1');

  await expect(line(page)).toContainText('01 now');
  await page.getByTestId('coach-reject').click();
  await expect(badge(page)).toContainText('You called it: 01 is rejected, because it ended in q0.');
  await page.getByTestId('coach-run').click();
  await expect(page.getByTestId('coach-onward')).toHaveText('On to level 1');
  await page.getByTestId('coach-onward').click();
  await expect(page).toHaveURL(/#\/level\/dfa-ends-in-1$/);
});

test('a lesson opens on its own machine every time', async ({ page }) => {
  await page.goto('/#/lesson/lesson-accepting');
  await page.getByTestId('feed-1').click();
  await page.getByTestId('feed-0').click();
  await page.getByRole('button', { name: /^State one/ }).click();
  await page.getByTestId('toggle-accepting').click();
  await expect(page.locator('g.state.is-accepting')).toHaveCount(1);
  await page.getByTestId('back').click();
  await page.locator('[data-testid="lesson-row"][data-lesson="lesson-accepting"]').click();
  await expect(page.locator('g.state.is-accepting')).toHaveCount(0);
  await expect(line(page)).toContainText('counts 1s');
});

test('tapping a string asks what you expect, until the suite has run', async ({ page }) => {
  await takeSolution(page);
  await page.locator('[data-input="101"]').click();
  await expect(page.getByTestId('predict')).toBeVisible();
  await expect(page.getByTestId('predict-question')).toHaveText('Will your machine accept 101?');
  await page.getByTestId('predict-accept').click();
  await expect(page.getByTestId('trace-verdict')).toHaveText('accepted');
  await expect(page.getByTestId('trace-remark')).toHaveText(
    'You called it: 101 is accepted, because it ended in q1.',
  );

  // Once the suite has run, each row's mark already says it, so a row just plays.
  await page.getByTestId('trace-close').click();
  await page.getByTestId('run').click();
  const stay = page.getByTestId('results-stay');
  if (await stay.isVisible()) await stay.click();
  await openPane(page);
  await page.locator('[data-input="10"]').click();
  await expect(page.getByTestId('predict')).toBeHidden();
  await expect(page.getByTestId('trace')).toBeVisible();
  await expect(page.getByTestId('trace-verdict')).toHaveText('rejected');
});

test('Stop asking turns the question off, and Settings turns it back on', async ({ page }) => {
  await takeSolution(page);
  await page.locator('[data-input="101"]').click();
  await page.getByTestId('predict-stop').click();
  await expect(page.getByTestId('trace')).toBeVisible();
  await page.getByTestId('trace-close').click();
  await openPane(page);
  await page.locator('[data-input="01"]').click();
  await expect(page.getByTestId('predict')).toBeHidden();
  await expect(page.getByTestId('trace')).toBeVisible();

  await page.getByTestId('back').click();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('predict-play')).toBeChecked();
  await page.getByTestId('predict-ask').check();
  await page.keyboard.press('Escape');

  // A level whose machine is still drawn opens with its verdict restored, and
  // then there is nothing to guess; a fresh one asks again.
  await takeSolution(page, 'dfa-even-zeros');
  await page.locator('[data-input="00"]').click();
  await expect(page.getByTestId('predict')).toBeVisible();
});
