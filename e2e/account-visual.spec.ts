import { expect, test, type Page } from '@playwright/test';
import { openGame } from './helpers';
import { fillerRows, mockSupabase, seedSession } from './supabaseMock';

const SHOTS = 'test-results/screenshots';

async function noHorizontalBodyScroll(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, 'page must not scroll sideways').toBeLessThanOrEqual(clientW);
}

/** The account bar must not overlap the heading or the picker. */
async function accountBarClear(page: Page) {
  const bar = await page.locator('.account-bar').boundingBox();
  for (const sel of ['h1', '.modes']) {
    const other = await page.locator(sel).boundingBox();
    if (!bar || !other) throw new Error('missing box');
    const overlap =
      bar.x < other.x + other.width &&
      other.x < bar.x + bar.width &&
      bar.y < other.y + other.height &&
      other.y < bar.y + bar.height;
    // h1 is a full-width block; compare against its text width instead.
    if (sel === 'h1') {
      const textRight = await page.locator('h1').evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().right;
      });
      expect(bar.y >= other.y + other.height || bar.x >= textRight, 'account bar overlaps the heading').toBe(true);
    } else {
      expect(overlap, `account bar overlaps ${sel}`).toBe(false);
    }
  }
}

async function shot(page: Page, name: string) {
  await noHorizontalBodyScroll(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280] as const) {
    const tag = `${width}-${scheme}`;

    test(`sign-in UI ${tag}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await mockSupabase(page);
      await page.goto('./');
      await page.evaluate(() => document.fonts.ready);
      await accountBarClear(page);
      await page.locator('#openAccount').click();
      await expect(page.locator('#email')).toBeVisible();
      await shot(page, `signin-${tag}`);
    });

    test(`username setup ${tag}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await seedSession(page);
      await mockSupabase(page, { username: null });
      await page.goto('./');
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#username').fill('taken_name');
      await page.locator('#age13').check();
      await page.locator('#saveProfile').click();
      await expect(page.locator('.account .fb')).toHaveText('That username is taken. Try another.');
      await shot(page, `username-${tag}`);
    });

    test(`leaderboard ${tag}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await seedSession(page);
      const rows = fillerRows(60, 95_000, 118, 2_300);
      rows[56] = { ...rows[56]!, username: 'neonfan', is_me: true };
      rows[0] = { ...rows[0]!, username: 'a_very_long_name_20c' };
      await mockSupabase(page, { username: 'neonfan', boards: new Map([['nameInOrder:all', rows]]) });
      await page.goto('./');
      await page.evaluate(() => document.fonts.ready);
      await accountBarClear(page);
      await page.locator('#openBoard').click();
      await page.getByRole('tab', { name: 'Name in order' }).click();
      await expect(page.locator('.board-table tr.me')).toHaveAttribute('data-rank', '57');
      await shot(page, `leaderboard-${tag}`);
    });

    test(`results with rank ${tag}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await seedSession(page);
      await mockSupabase(page, { username: 'neonfan', boards: new Map([['nameAll:all', fillerRows(5, 1, 118, 1)]]) });
      await page.goto('./');
      await openGame(page, 'nameAll');
      for (const n of ['hydrogen', 'helium', 'lithium']) await page.locator('#nameIn').fill(n);
      await page.getByRole('button', { name: 'Give up' }).click();
      await page.locator('#submitRun').click();
      await expect(page.locator('.submit-status')).toContainText('Submitted. Your rank: #6 all-time');
      await shot(page, `results-rank-${tag}`);
    });
  }
}

test('account bar clears the heading between the breakpoints', async ({ page }) => {
  await mockSupabase(page);
  for (const width of [561, 640, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    await accountBarClear(page);
    await noHorizontalBodyScroll(page);
  }
});
