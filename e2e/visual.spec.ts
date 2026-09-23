import { expect, test, type Page } from '@playwright/test';
import { answer, openGame } from './helpers';

const WIDTHS = [375, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;
const SHOTS = 'test-results/screenshots';

async function noHorizontalBodyScroll(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, 'page must not scroll sideways').toBeLessThanOrEqual(clientW);
}

/** Every rendered tile's background must equal its family token. */
async function tilesUseFamilyColors(page: Page, selector: string) {
  const mismatches = await page.evaluate((sel) => {
    const bad: string[] = [];
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const fam = el.dataset.family;
      probe.style.background = `var(--f-${fam})`;
      const want = getComputedStyle(probe).backgroundColor;
      const got = getComputedStyle(el).backgroundColor;
      if (!fam || want !== got || want === 'rgba(0, 0, 0, 0)') bad.push(`${fam}: ${got} != ${want}`);
    }
    probe.remove();
    return bad;
  }, selector);
  expect(mismatches).toEqual([]);
}

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    test(`layout ${width}px ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await page.evaluate(() => document.fonts.ready);

      // Tile text stays dark ink in both themes.
      const ink = await page.locator('.mode').first().evaluate((el) => getComputedStyle(el).color);
      expect(ink).toBe('rgb(21, 35, 44)');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(scheme === 'dark' ? 'rgb(18, 28, 35)' : 'rgb(230, 236, 238)');

      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/home-${width}-${scheme}.png`, fullPage: true });

      // Quiz prompt, then the revealed tile after an answer.
      await openGame(page, 'symbolToName');
      await tilesUseFamilyColors(page, '#tileSlot .tile');
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/quiz-${width}-${scheme}.png`, fullPage: true });
      await answer(page, 'wrong');
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/quiz-answered-${width}-${scheme}.png`, fullPage: true });

      // Name them all: the table scrolls inside its own wrapper.
      await openGame(page, 'nameAll');
      for (const n of ['hydrogen', 'carbon', 'iron', 'gold', 'neon', 'uranium', 'cerium']) {
        await page.locator('#nameIn').pressSequentially(n);
      }
      await expect(page.locator('#count')).toHaveText('7');
      await tilesUseFamilyColors(page, '.cell.found');
      const wrap = await page.locator('.tablewrap').evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        scrolls: el.scrollWidth > el.clientWidth,
      }));
      expect(wrap.overflowX).toBe('auto');
      expect(wrap.scrolls).toBe(width < 720);
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/nameall-${width}-${scheme}.png`, fullPage: true });

      await page.getByRole('button', { name: 'Give up' }).click();
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/nameall-over-${width}-${scheme}.png`, fullPage: true });

      // Results screen with missed tiles.
      await openGame(page, 'guessMass');
      for (let q = 0; q < 10; q++) {
        await answer(page, '1');
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('#finalScore')).toBeVisible();
      await tilesUseFamilyColors(page, '.misses .tile');
      await noHorizontalBodyScroll(page);
      await page.screenshot({ path: `${SHOTS}/results-${width}-${scheme}.png`, fullPage: true });
    });
  }
}

test('data-theme overrides the system scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(230, 236, 238)');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(18, 28, 35)');
});

test('reduced motion disables the pop animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await openGame(page, 'nameAll');
  await page.locator('#nameIn').pressSequentially('helium');
  const anim = await page.locator('#c2').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});
