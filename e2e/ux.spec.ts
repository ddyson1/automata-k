import { expect, test, type Page } from '@playwright/test';

/**
 * The pane's edge, the settings sheet, and the controls' focus and reach.
 * Resize and fold exist on a wide window only; a phone keeps its rail.
 */

async function open(page: Page, levelId: string): Promise<void> {
  await page.goto(`/#/level/${levelId}`);
  await expect(page.getByTestId('stage')).toBeVisible();
}

const paneWidth = (page: Page): Promise<number> =>
  page.getByTestId('pane').evaluate((n) => n.getBoundingClientRect().width);

async function dragEdge(page: Page, dx: number): Promise<void> {
  const box = await page.getByTestId('pane-resize').boundingBox();
  if (!box) throw new Error('no resize handle');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test.describe('on a wide window', () => {
  test.skip(({ isMobile, viewport }) => isMobile || (viewport?.width ?? 0) < 900, 'wide only');

  test('the pane resizes from its right edge, and remembers', async ({ page }) => {
    await open(page, 'dfa-ends-in-1');
    expect(await paneWidth(page)).toBeCloseTo(380, 0);

    await dragEdge(page, 120);
    expect(await paneWidth(page)).toBeCloseTo(500, -1);
    await page.reload();
    await expect(page.getByTestId('stage')).toBeVisible();
    expect(await paneWidth(page)).toBeCloseTo(500, -1);

    // The keyboard can do what the pointer does.
    const edge = page.getByTestId('pane-resize');
    await edge.focus();
    await page.keyboard.press('Home');
    await expect(edge).toHaveAttribute('aria-valuenow', '320');
    await page.keyboard.press('ArrowRight');
    await expect(edge).toHaveAttribute('aria-valuenow', '336');
    expect(await paneWidth(page)).toBeCloseTo(336, 0);

    // A double click puts it back.
    await edge.dblclick();
    expect(await paneWidth(page)).toBeCloseTo(380, 0);
  });

  test('the pane never squeezes the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await open(page, 'dfa-ends-in-1');
    await dragEdge(page, 600);
    // 1000 minus the 420 the canvas keeps, capped at 560.
    expect(await paneWidth(page)).toBeCloseTo(560, 0);

    await page.setViewportSize({ width: 920, height: 800 });
    await expect.poll(() => paneWidth(page)).toBeCloseTo(500, 0);
    const stage = await page.getByTestId('stage').boundingBox();
    expect(stage?.width ?? 0).toBeGreaterThanOrEqual(420);

    // Asked-for width comes back when the window does.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => paneWidth(page)).toBeCloseTo(560, 0);
  });

  test('the pane folds away and comes back, and stays folded', async ({ page }) => {
    await open(page, 'dfa-ends-in-1');
    // Run appears once there is a machine to run.
    await page.getByTestId('tab-hint').click();
    await page.getByTestId('reveal').click();
    await page.getByTestId('pane-fold').click();
    await expect.poll(() => paneWidth(page)).toBe(0);
    await expect(page.getByTestId('pane-unfold')).toBeFocused();
    await expect(page.getByTestId('pane-unfold')).toHaveAttribute('aria-expanded', 'false');
    // Run stays in reach; there is no results band to fold it into.
    await expect(page.getByTestId('run')).toBeVisible();
    await expect(page.getByTestId('dock')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('pane-unfold')).toBeVisible();
    expect(await paneWidth(page)).toBe(0);

    await page.getByTestId('pane-unfold').click();
    await expect.poll(() => paneWidth(page)).toBeCloseTo(380, 0);
    await expect(page.getByTestId('pane-fold')).toBeFocused();
    await expect(page.getByTestId('pane-unfold')).toBeHidden();
  });
});

test('on a phone the pane is still the rail, with no edge to drag', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 900, 'narrow only');
  await open(page, 'dfa-ends-in-1');
  await expect(page.getByTestId('pane-grab')).toBeVisible();
  await expect(page.getByTestId('pane-resize')).toBeHidden();
  await expect(page.getByTestId('pane-fold')).toBeHidden();
  await expect(page.getByTestId('pane-unfold')).toBeHidden();
  const stage = await page.getByTestId('stage').boundingBox();
  expect(stage?.width).toBeCloseTo(viewport?.width ?? 0, 0);
});

test('settings choose a theme and a motion preference, and both persist', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  await page.getByTestId('settings-open').click();
  const sheet = page.getByTestId('settings');
  const theme = sheet.getByRole('group', { name: 'Theme' });
  const motion = sheet.getByRole('group', { name: 'Motion' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('theme-system')).toBeChecked();
  await expect(sheet.getByTestId('motion-system')).toBeChecked();

  await theme.getByRole('radio', { name: 'Dark' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await motion.getByRole('radio', { name: 'Reduce' }).click();
  await expect(root).toHaveAttribute('data-motion', 'reduce');
  const duration = await sheet.evaluate((n) => getComputedStyle(n).transitionDuration);
  expect(duration.split(',').every((d) => parseFloat(d) < 0.001)).toBe(true);

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-motion', 'reduce');
  await page.getByTestId('settings-open').click();
  await expect(sheet.getByTestId('theme-dark')).toBeChecked();
  await expect(sheet.getByTestId('motion-reduce')).toBeChecked();

  // The arrow keys move within a group, as radios do.
  await sheet.getByTestId('theme-dark').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sheet.getByTestId('theme-system')).toBeChecked();
  await expect(root).not.toHaveAttribute('data-theme', /.*/);

  await motion.getByRole('radio', { name: 'System' }).click();
  await expect(root).not.toHaveAttribute('data-motion', /.*/);
});

/** A visible ring on keyboard focus, and a target no smaller than --tap. */
async function expectReachable(page: Page, selector: string): Promise<void> {
  const nodes = page.locator(selector);
  const count = await nodes.count();
  expect(count, `${selector} exists`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const node = nodes.nth(i);
    if (!(await node.isVisible())) continue;
    const box = await node.boundingBox();
    expect(box?.height ?? 0, `${selector}[${i}] height`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${selector}[${i}] width`).toBeGreaterThanOrEqual(44);
    await node.focus();
    const ring = await node.evaluate((n) => {
      const s = getComputedStyle(n);
      return { visible: n.matches(':focus-visible'), style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(ring.visible, `${selector}[${i}] matches :focus-visible`).toBe(true);
    expect(ring.style, `${selector}[${i}] draws a ring`).not.toBe('none');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
  }
}

test('every control shows its focus and is a full tap target', async ({ page }) => {
  await page.goto('/');
  await expectReachable(page, '.ghost');

  await page.goto('/#/level/pda-an-bn');
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.keyboard.press('Tab');
  await expectReachable(page, '.corner-b:not(:disabled)');

  const grab = page.getByTestId('pane-grab');
  if (await grab.isVisible()) await grab.click();
  await page.keyboard.press('Tab');
  await expectReachable(page, '.pane-tab');

  await page.getByTestId('tab-hint').click();
  await page.getByTestId('reveal').click();
  if (await grab.isVisible()) {
    const isOpen = await page.getByTestId('pane').evaluate((n) => n.classList.contains('is-open'));
    if (!isOpen) await grab.click();
  }
  await page.getByTestId('tab-brief').click();
  await page.locator('[data-input="aabb"]').click();
  await expect(page.getByTestId('trace')).toBeVisible();
  await page.keyboard.press('Tab');
  await expectReachable(page, '.transport:not(:disabled)');
});
