import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers';

// The site is deployed under /chemdrills/ on GitHub Pages, and every build
// uses that base (vite.config.ts). This guards the base path itself: if an
// asset path is built by hand without import.meta.env.BASE_URL, it requests
// from the host root and fails here, not only after deploying.
const BASE_PATH = '/chemdrills/';

test('the app loads under the base path with every asset from it', async ({ page, baseURL }) => {
  const errors = trackErrors(page);
  const sameOrigin: { url: string; status: number }[] = [];
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin === new URL(baseURL ?? '').origin) sameOrigin.push({ url: url.pathname, status: res.status() });
  });
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));

  const res = await page.goto('./');
  // Loaded directly: vite preview redirects '/' to the base, GitHub Pages does not.
  expect(res?.status()).toBe(200);
  expect(res?.request().redirectedFrom()).toBeNull();
  expect(new URL(page.url()).pathname).toBe(BASE_PATH);

  await expect(page.locator('h1')).toHaveText('Element Drills');
  await expect(page.locator('.mode')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('800 20px "Bricolage Grotesque"'))).toBe(true);

  // Every same-origin request was under the base path and succeeded.
  expect(sameOrigin.length).toBeGreaterThan(1); // the page plus its script and stylesheet
  for (const r of sameOrigin) {
    expect(r.url, 'same-origin request outside the base path').toMatch(/^\/chemdrills\//);
    expect(r.status, `${r.url} status`).toBeLessThan(400);
  }
  expect(errors).toEqual([]);
});
