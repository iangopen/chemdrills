import { expect, test } from '@playwright/test';
import { FAMILIES } from '../src/data/elements';
import { BLOCK_STORAGE, trackErrors } from './helpers';
import {
  bgOf,
  bucket,
  bucketIds,
  familyOf,
  mouseDrag,
  openSort,
  tokenColor,
  trayTile,
  trayZs,
  wrongBucketFor,
} from './sortHelpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('mouse: a full round by drag, with a wrong drop and a drop outside', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await openSort(page);
  await expect(page.locator('.seg button[data-range="36"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#clock')).toHaveText('0:00');

  const zs = await trayZs(page);
  expect(zs).toHaveLength(12);
  const [first, second] = zs as [number, number];

  // Dropped outside every bucket: back to the tray, not a mistake.
  await mouseDrag(page, trayTile(page, first), page.locator('h1'));
  await expect(trayTile(page, first)).toBeVisible();
  await expect(page.locator('#mistakes')).toHaveText('0');
  await expect(page.locator('#placed')).toHaveText('0');
  await expect(page.locator('#sortMsg')).toContainText('back in the tray');
  await expect(page.locator('.drag-preview')).toHaveCount(0);

  // A deliberate wrong drop: back to the tray, counts a mistake.
  const wrong = await wrongBucketFor(page, second);
  await mouseDrag(page, trayTile(page, second), bucket(page, wrong));
  await expect(page.locator('#mistakes')).toHaveText('1');
  await expect(trayTile(page, second)).toBeVisible();
  await expect(page.locator('#sortMsg')).toContainText("doesn't go in");

  // Let some time pass on the round clock.
  await page.clock.fastForward(40_000);
  await expect(page.locator('#clock')).toHaveText(/^0:4\d$/);

  // Everything into the right bucket.
  for (const z of zs) {
    await mouseDrag(page, trayTile(page, z), bucket(page, familyOf(z)));
    if (z !== zs[zs.length - 1]) {
      await expect(bucket(page, familyOf(z)).locator(`.tile.xs[data-z="${z}"]`)).toBeVisible();
    }
  }

  await expect(page.locator('#finalScore')).toHaveText('11 of 12');
  const timeText = (await page.locator('#finalTime b').textContent()) ?? '';
  expect(timeText).toMatch(/^[01]:\d\d$/);
  const [m = 0, s = 0] = timeText.split(':').map(Number);
  const seconds = m * 60 + s;
  expect(seconds).toBeGreaterThanOrEqual(40);

  // Results: the one retried tile, shown with its correct family.
  const retried = page.locator('.retried .retried-item');
  await expect(retried).toHaveCount(1);
  await expect(retried.first()).toHaveAttribute('data-z', String(second));
  const label = FAMILIES.find((f) => f.id === familyOf(second))?.label ?? '';
  await expect(retried.first().locator('.retried-family')).toHaveText(label);
  expect(await bgOf(retried.first().locator('.tile'))).toBe(await tokenColor(page, `--f-${familyOf(second)}`));

  // Best: score and time, stored together.
  await expect(page.locator('#bestLine')).toHaveText(`Best for elements 1–36: 11 in ${timeText}`);
  const stored = await page.evaluate(() => localStorage.getItem('eldrills:v1:best:familySort:36'));
  expect(JSON.parse(stored ?? 'null')).toEqual({ score: 11, seconds });
  await expect(page.locator('#again')).toBeFocused();
});

test('keyboard only: a full round by Tab and Enter', async ({ page }) => {
  await page.goto('/');
  // Tab to the Family sort picker button (6th game).
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  await expect(page.locator('.mode[data-game="familySort"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tray-tile').first()).toBeFocused();

  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { z: el?.dataset.trayZ ?? null, bucket: el?.dataset.bucket ?? null };
    });

  let madeMistake = false;
  for (let placed = 0; placed < 12; placed++) {
    const f = await focused();
    const z = Number(f.z);
    expect(Number.isInteger(z) && z > 0).toBe(true);
    await page.keyboard.press('Enter');
    await expect(trayTile(page, z)).toHaveAttribute('aria-pressed', 'true');

    // One deliberate wrong placement, the first time round.
    const target = !madeMistake ? await wrongBucketFor(page, z) : familyOf(z);
    for (let i = 0; i < 40 && (await focused()).bucket !== target; i++) await page.keyboard.press('Tab');
    expect((await focused()).bucket).toBe(target);
    await page.keyboard.press('Enter');

    if (!madeMistake) {
      madeMistake = true;
      await expect(page.locator('#mistakes')).toHaveText('1');
      await expect(trayTile(page, z)).toBeFocused(); // focus returns to the tile
      placed--;
      continue;
    }
    if (placed < 11) await expect(page.locator('#placed')).toHaveText(String(placed + 1));
  }
  await expect(page.locator('#finalScore')).toHaveText('11 of 12');
  await expect(page.locator('.retried .retried-item')).toHaveCount(1);
  await expect(page.locator('#again')).toBeFocused();
});

test('tap-to-place with the mouse: click a tile, then a bucket', async ({ page }) => {
  await page.goto('/');
  await openSort(page);
  const [z] = (await trayZs(page)) as [number];
  await bucket(page, familyOf(z)).click();
  await expect(page.locator('#sortMsg')).toHaveText('Select a tile first, then a family.');
  await trayTile(page, z).click();
  await expect(trayTile(page, z)).toHaveAttribute('aria-pressed', 'true');
  await trayTile(page, z).click(); // toggles off
  await expect(trayTile(page, z)).toHaveAttribute('aria-pressed', 'false');
  await trayTile(page, z).click();
  await bucket(page, familyOf(z)).click();
  await expect(page.locator('#placed')).toHaveText('1');
  await expect(trayTile(page, z)).toHaveCount(0);
});

test('tray tiles are neutral; a placed tile takes its family color', async ({ page }) => {
  await page.goto('/');
  await openSort(page);
  const neutral = await tokenColor(page, '--tile-neutral');
  const zs = await trayZs(page);
  for (const z of zs) {
    const tile = trayTile(page, z).locator('.tile');
    const bg = await bgOf(tile);
    expect(bg).toBe(neutral);
    expect(bg).not.toBe(await tokenColor(page, `--f-${familyOf(z)}`));
    // The family must not leak into the DOM either.
    await expect(tile).not.toHaveAttribute('data-family', /.*/);
  }
  const z = zs[0] as number;
  await mouseDrag(page, trayTile(page, z), bucket(page, familyOf(z)));
  const placed = bucket(page, familyOf(z)).locator(`.tile.xs[data-z="${z}"]`);
  expect(await bgOf(placed)).toBe(await tokenColor(page, `--f-${familyOf(z)}`));
});

test('buckets: only in-range families, in table order; never Z 104+; range switch restarts', async ({ page }) => {
  await page.goto('/');
  await openSort(page);
  await page.locator('.seg button[data-range="20"]').click();
  expect(await bucketIds(page)).toEqual(['alkali', 'alkaline', 'post', 'metalloid', 'nonmetal', 'halogen', 'noble']);
  expect((await trayZs(page)).every((z) => z <= 20)).toBe(true);

  // Place one, then switch range mid-round: a fresh round.
  const [z] = (await trayZs(page)) as [number];
  await mouseDrag(page, trayTile(page, z), bucket(page, familyOf(z)));
  await expect(page.locator('#placed')).toHaveText('1');
  await page.locator('.seg button[data-range="118"]').click();
  await expect(page.locator('#placed')).toHaveText('0');
  await expect(page.locator('#mistakes')).toHaveText('0');
  await expect(page.locator('.tray-tile')).toHaveCount(12);
  expect(await bucketIds(page)).toEqual(FAMILIES.map((f) => f.id));

  // Deal many rounds under All: never a tile from Z 104+.
  for (let i = 0; i < 15; i++) {
    expect(Math.max(...(await trayZs(page)))).toBeLessThan(104);
    await page.locator('.seg button[data-range="54"]').click();
    await page.locator('.seg button[data-range="118"]').click();
  }
});

test('Family sort works with localStorage throwing', async ({ page }) => {
  await page.addInitScript(BLOCK_STORAGE);
  await page.goto('/');
  await openSort(page);
  for (const z of await trayZs(page)) {
    await mouseDrag(page, trayTile(page, z), bucket(page, familyOf(z)));
  }
  await expect(page.locator('#finalScore')).toHaveText('12 of 12');
  await expect(page.locator('#bestLine')).toContainText('Best for elements 1–36: 12 in');
  await expect(page.locator('.retried-item')).toHaveCount(0);
});
