/**
 * Design Studio in a real browser: /studio/cad opens, draws its 3D view,
 * selects planes from the tree and from the view, snaps the pointer reading
 * to the grid, checks typed lengths, and labels unbuilt tools honestly.
 * Needs the site running (KR_BASE_URL, default http://localhost:3000).
 * Run: npx playwright test tests/cad-workspace.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = '[data-testid="cad-viewport"]';

/** Uncaught errors on the page, and console errors from three.js, WebGL, React or the CAD code. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && /three|webgl|react|\[cad\]|hydrat/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openStudio(page: Page) {
  await page.goto('/studio/cad');
  await expect(page.locator(`${VIEWPORT} canvas`)).toBeVisible({ timeout: 60_000 });
}

/** A point in the 3D view, as an offset in pixels from its centre. */
async function viewPoint(page: Page, dx: number, dy: number) {
  const box = await page.locator(VIEWPORT).boundingBox();
  if (!box) throw new Error('3D view has no size');
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}

async function readCursor(page: Page): Promise<{ x: number; y: number } | null> {
  const text = (await page.getByTestId('cad-cursor').textContent()) ?? '';
  const m = /X (-?[\d,.]+)\s+Y (-?[\d,.]+) mm/.exec(text);
  return m ? { x: Number(m[1].replace(/,/g, '')), y: Number(m[2].replace(/,/g, '')) } : null;
}

test.describe('Design Studio workspace', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('opens with a 3D view, and tools from later phases are disabled with their phase', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    await expect(page).toHaveTitle(/Design Studio/);
    await expect(page.getByRole('toolbar', { name: 'Modelling tools' })).toBeVisible();

    for (const id of ['select', 'fit', 'grid', 'axes', 'settings']) {
      await expect(page.locator(`[data-tool="${id}"]`), id).toBeEnabled();
    }
    const later: [string, number][] = [['box', 2], ['cylinder', 2], ['new', 3], ['undo', 3], ['redo', 3], ['sketch', 4], ['extrude', 4], ['revolve', 4], ['union', 4], ['cut', 4], ['intersect', 4], ['measure', 4], ['open', 6], ['save', 6], ['export', 6]];
    for (const [id, phase] of later) {
      const button = page.locator(`[data-tool="${id}"]`);
      await expect(button, id).toBeDisabled();
      await expect(button, id).toHaveAttribute('aria-label', new RegExp(`arrives in phase ${phase}$`));
    }
    await expect(page.getByText('Geometry kernel: not loaded (phase 2)')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('selects a plane from the model tree, and a click on empty space clears it', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    const properties = page.getByRole('complementary', { name: 'Properties' });

    await page.locator('[data-datum="plane-xz"]').click();
    await expect(page.locator('[data-datum="plane-xz"]')).toHaveAttribute('aria-current', 'true');
    await expect(properties.getByRole('heading', { name: 'XZ plane' })).toBeVisible();
    await expect(properties).toContainText('−Y');
    await expect(page.getByText('Selected: XZ plane')).toBeVisible();

    // Sky above the model: nothing there to pick.
    const empty = await viewPoint(page, 0, -330);
    await page.mouse.click(empty.x, empty.y);
    await expect(properties.getByRole('heading', { name: 'Untitled project' })).toBeVisible();

    await page.locator('[data-datum="plane-xy"]').click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Selected: nothing')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a click on a plane in the 3D view selects it; a drag does not', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    // From the top, the XY plane faces the camera and the other two are edge-on.
    await page.locator('[data-view="top"]').click();
    const onPlane = await viewPoint(page, 80, -80);
    await page.mouse.click(onPlane.x, onPlane.y);
    await expect(page.locator('[data-datum="plane-xy"]')).toHaveAttribute('aria-current', 'true');

    // An orbit that ends over empty space must not clear the selection.
    const start = await viewPoint(page, 0, -330);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y + 10, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('[data-datum="plane-xy"]')).toHaveAttribute('aria-current', 'true');

    // Hiding the selected plane drops the selection.
    await page.getByRole('button', { name: 'Hide XY plane' }).click();
    await expect(page.getByText('Selected: nothing')).toBeVisible();
    await expect(page.locator('[data-datum="plane-xy"]')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('the pointer reading snaps to the grid, and grid spacing is checked', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    await page.locator('[data-view="top"]').click();

    const p = await viewPoint(page, 90, -70);
    await page.mouse.move(p.x, p.y);
    await expect.poll(() => readCursor(page)).not.toBeNull();
    const at100 = await readCursor(page);
    expect(at100!.x % 100).toBe(0);
    expect(at100!.y % 100).toBe(0);
    expect(at100!.x).toBeGreaterThan(0);
    expect(at100!.y).toBeGreaterThan(0);

    await page.locator('[data-tool="settings"]').click();
    const dialog = page.getByRole('dialog', { name: 'Workspace settings' });
    const spacing = dialog.getByLabel('Grid spacing');

    await spacing.fill('0');
    await spacing.press('Enter');
    await expect(dialog.getByRole('alert')).toHaveText('A length must be more than 0 mm.');
    await spacing.fill('12,5');
    await spacing.press('Enter');
    await expect(dialog.getByRole('alert')).toContainText('Use a dot for decimals');
    await expect(page.getByTestId('cad-grid-status')).toHaveText('Grid 100 mm · Snap on');

    await spacing.fill('0.5 m');
    await spacing.press('Enter');
    await expect(page.getByTestId('cad-grid-status')).toHaveText('Grid 500 mm · Snap on');
    await expect(spacing).toHaveValue('500');

    await spacing.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.mouse.move(p.x + 3, p.y + 3);
    await page.mouse.move(p.x, p.y);
    await expect.poll(async () => (await readCursor(page))?.x).toBeDefined();
    const at500 = await readCursor(page);
    expect(at500!.x % 500).toBe(0);
    expect(at500!.y % 500).toBe(0);
    expect(errors).toEqual([]);
  });

  test('view toggles, standard views and panels work from the toolbar and keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    const grid = page.locator('[data-tool="grid"]');
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await page.locator(VIEWPORT).click({ position: { x: 20, y: 120 } });
    await page.keyboard.press('g');
    await expect(grid).toHaveAttribute('aria-pressed', 'true');

    const axes = page.locator('[data-tool="axes"]');
    await axes.click();
    await expect(axes).toHaveAttribute('aria-pressed', 'false');

    for (const key of ['f', 'i', 't']) await page.keyboard.press(key);
    for (const view of ['iso', 'top', 'front', 'right']) await page.locator(`[data-view="${view}"]`).click();
    await page.locator('[data-tool="fit"]').click();

    const tree = page.getByRole('navigation', { name: 'Model tree' });
    await page.getByRole('button', { name: 'Model tree', exact: true }).click();
    await expect(tree).toBeHidden();
    await page.getByRole('button', { name: 'Model tree', exact: true }).click();
    await expect(tree).toBeVisible();
    await expect(page.locator(`${VIEWPORT} canvas`)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Design Studio on a phone', () => {
  test.use({ viewport: { width: 400, height: 820 } });

  test('panels start closed and open over the 3D view', async ({ page }) => {
    const errors = watchErrors(page);
    await openStudio(page);
    const tree = page.getByRole('navigation', { name: 'Model tree' });
    await expect(tree).toBeHidden();
    await page.getByRole('button', { name: 'Model tree', exact: true }).click();
    await expect(tree).toBeVisible();
    await tree.getByRole('button', { name: 'Hide model tree' }).click();
    await expect(tree).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('the existing /studio designer still opens', async ({ page }) => {
  const errors = watchErrors(page);
  const response = await page.goto('/studio');
  expect(response?.status()).toBe(200);
  await expect(page.getByText(/Enter validated dimensions/)).toBeVisible({ timeout: 60_000 });
  expect(errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
});
