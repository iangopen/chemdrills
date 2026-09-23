import { expect, test, type Page } from '@playwright/test';
import { bucket, familyOf, mouseDrag, openSort, trayTile, trayZs, wrongBucketFor } from './sortHelpers';

const SHOTS = 'test-results/screenshots';

async function noHorizontalBodyScroll(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, 'page must not scroll sideways').toBeLessThanOrEqual(clientW);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280] as const) {
    test(`family sort ${width}px ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await openSort(page);
      await page.locator('.seg button[data-range="118"]').click(); // all 10 buckets: the tightest layout
      await expect(page.locator('.bucket')).toHaveCount(10);
      await noHorizontalBodyScroll(page);

      // Every bucket fits the width; none clipped sideways.
      const boxes = await page.locator('.bucket').evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
      );
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(width);
      }

      // Mid-round: two placed, one wrong (outlined), one selected.
      const zs = await trayZs(page);
      const [a, b, c, d] = zs as [number, number, number, number];
      await page.locator('#tray').scrollIntoViewIfNeeded();
      await mouseDrag(page, trayTile(page, a), bucket(page, familyOf(a)));
      await mouseDrag(page, trayTile(page, b), bucket(page, familyOf(b)));
      await trayTile(page, c).click();
      await bucket(page, await wrongBucketFor(page, c)).click();
      await trayTile(page, d).click();
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/sort-mid-${width}-${scheme}.png`, fullPage: true });

      // Viewport-only shot at phone size: what the player actually sees.
      if (width === 375) {
        await page.evaluate(() => {
          const t = document.getElementById('tray');
          if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 60);
        });
        await page.screenshot({ path: `${SHOTS}/sort-mid-viewport-${width}-${scheme}.png` });
      }

      // Results.
      await trayTile(page, d).click(); // deselect
      for (const z of await trayZs(page)) {
        await trayTile(page, z).click();
        await bucket(page, familyOf(z)).click();
      }
      await expect(page.locator('#finalScore')).toHaveText('11 of 12');
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/sort-results-${width}-${scheme}.png`, fullPage: true });
    });
  }
}
