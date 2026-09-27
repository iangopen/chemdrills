import { expect, test, type Page } from '@playwright/test';

async function rows(page: Page): Promise<number[][]> {
  const boxes = await page.locator('.mode').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: r.left, right: r.right };
    }),
  );
  const byTop = new Map<number, number[]>();
  boxes.forEach((b, i) => byTop.set(b.top, [...(byTop.get(b.top) ?? []), i]));
  return [...byTop.values()];
}

test('the game picker is one row at 1280px and three columns at 375px, labels inside their tiles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  const wide = await rows(page);
  expect(wide, 'all games on one row at 1280px').toHaveLength(1);
  expect(wide[0]).toHaveLength(await page.locator('.mode').count());

  await page.setViewportSize({ width: 375, height: 800 });
  const narrow = await rows(page);
  expect(narrow.map((r) => r.length).slice(0, -1).every((n) => n === 3), '3 per row at 375px').toBe(true);

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator('.mode').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight).map((el) => el.textContent),
    );
    expect(overflow, `no label overflows its tile at ${width}px`).toEqual([]);
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW);
  }
});
