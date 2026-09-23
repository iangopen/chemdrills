import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { trackErrors } from './helpers';
import {
  bucket,
  center,
  familyOf,
  openSort,
  scrollTrayToTop,
  touch,
  touchMoveSteps,
  trayTile,
  trayZs,
  wrongBucketFor,
} from './sortHelpers';

// Real touch input: CDP Input.dispatchTouchEvent goes through Chromium's
// input pipeline (hit-testing, touch-action, gesture/scroll handling,
// synthesized mouse events), unlike synthetic DOM TouchEvents.
test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

let errors: string[] = [];
let cdp: CDPSession;

async function setup(page: Page) {
  errors = trackErrors(page);
  await page.goto('./');
  await openSort(page);
  await scrollTrayToTop(page);
  cdp = await page.context().newCDPSession(page);
}

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bodyStyles = (page: Page) =>
  page.evaluate(() => ({ userSelect: document.body.style.userSelect, cursor: document.body.style.cursor }));

test('a) a full touch drag lands in the correct bucket; preview sits above the finger', async ({ page }) => {
  await setup(page);
  const [z] = (await trayZs(page)) as [number];
  const from = { ...(await center(trayTile(page, z))), id: 1 };
  const to = await center(bucket(page, familyOf(z)));

  await touch(cdp, 'touchStart', [from]);
  const mid = await touchMoveSteps(cdp, from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 5);
  const preview = await page.locator('.drag-preview').boundingBox();
  expect(preview).not.toBeNull();
  expect((preview?.y ?? 0) + (preview?.height ?? 0)).toBeLessThan(mid.y); // above the finger, not under it

  // Every bucket is on screen mid-drag (the bucket grid is sticky at 375px).
  for (const box of await page.locator('.bucket').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
  )) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(667);
  }

  const last = await touchMoveSteps(cdp, mid, to, 5);
  await expect(bucket(page, familyOf(z))).toHaveClass(/hover/);
  await touch(cdp, 'touchEnd', []);
  void last;

  await expect(trayTile(page, z)).toHaveCount(0);
  await expect(bucket(page, familyOf(z)).locator(`.tile.xs[data-z="${z}"]`)).toBeVisible();
  await expect(page.locator('#placed')).toHaveText('1');
  await expect(page.locator('#mistakes')).toHaveText('0');
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  expect(await bodyStyles(page)).toEqual({ userSelect: '', cursor: '' });
});

test('b) touchcancel mid-drag leaves no stuck state and restores body styles', async ({ page }) => {
  await setup(page);
  const [z] = (await trayZs(page)) as [number];
  const from = { ...(await center(trayTile(page, z))), id: 7 };
  const wrong = await center(bucket(page, await wrongBucketFor(page, z)));

  await touch(cdp, 'touchStart', [from]);
  await touchMoveSteps(cdp, from, wrong, 6);
  expect(await bodyStyles(page)).toEqual({ userSelect: 'none', cursor: 'grabbing' });
  await expect(page.locator('.drag-preview')).toHaveCount(1);
  await expect(page.locator('.bucket.hover')).toHaveCount(1);

  await touch(cdp, 'touchCancel', []);

  await expect(page.locator('.drag-preview')).toHaveCount(0);
  await expect(page.locator('.bucket.hover')).toHaveCount(0);
  await expect(page.locator('.tray-tile.dragging')).toHaveCount(0);
  expect(await bodyStyles(page)).toEqual({ userSelect: '', cursor: '' });
  await expect(trayTile(page, z)).toBeVisible();
  await expect(page.locator('#mistakes')).toHaveText('0'); // cancelled, not judged
  await expect(page.locator('#placed')).toHaveText('0');

  // And the next drag works normally.
  const again = { ...(await center(trayTile(page, z))), id: 8 };
  await touch(cdp, 'touchStart', [again]);
  await touchMoveSteps(cdp, again, await center(bucket(page, familyOf(z))), 6);
  await touch(cdp, 'touchEnd', []);
  await expect(page.locator('#placed')).toHaveText('1');
});

test('c) a second finger mid-drag does not disturb the first', async ({ page }) => {
  await setup(page);
  const [a, b] = (await trayZs(page)) as [number, number];
  const f1 = { ...(await center(trayTile(page, a))), id: 1 };
  const target = await center(bucket(page, familyOf(a)));
  const wrongForA = await center(bucket(page, await wrongBucketFor(page, a)));

  await touch(cdp, 'touchStart', [f1]);
  const f1mid = await touchMoveSteps(cdp, f1, { x: f1.x + 20, y: f1.y + 30 }, 3);

  // Second finger goes down on another tile, wanders over a wrong bucket, lifts.
  const f2 = { ...(await center(trayTile(page, b))), id: 2 };
  await touch(cdp, 'touchStart', [f1mid, f2]);
  const f2last = await touchMoveSteps(cdp, f2, wrongForA, 5, [f1mid]);
  await expect(page.locator('.drag-preview')).toHaveCount(1);
  // CDP touchEnd lists the points being RELEASED (verified: touchEnd [p1] lifts
  // finger 1). So this lifts finger 2 only; finger 1 stays down.
  await touch(cdp, 'touchEnd', [f2last]);

  // Nothing was dropped or judged by finger 2.
  await expect(page.locator('.drag-preview')).toHaveCount(1);
  await expect(page.locator('#mistakes')).toHaveText('0');
  await expect(page.locator('#placed')).toHaveText('0');
  await expect(trayTile(page, b)).toHaveAttribute('aria-pressed', 'false');

  // Finger 1 finishes its drag into the right bucket.
  await touchMoveSteps(cdp, f1mid, target, 6);
  await touch(cdp, 'touchEnd', []);
  await expect(trayTile(page, a)).toHaveCount(0);
  await expect(page.locator('#placed')).toHaveText('1');
  await expect(page.locator('#mistakes')).toHaveText('0');
  await expect(trayTile(page, b)).toBeVisible();
});

test('d) mouse events right after touchend cause no second action', async ({ page }) => {
  await setup(page);
  const [a, b] = (await trayZs(page)) as [number, number];

  // Drag-drop by touch, then an immediate synthetic mousedown/mouseup at the drop point.
  const from = { ...(await center(trayTile(page, a))), id: 3 };
  const drop = await center(bucket(page, familyOf(a)));
  await touch(cdp, 'touchStart', [from]);
  await touchMoveSteps(cdp, from, drop, 6);
  await touch(cdp, 'touchEnd', []);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: drop.x, y: drop.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drop.x, y: drop.y, button: 'left', clickCount: 1 });
  await expect(page.locator('#placed')).toHaveText('1');
  await expect(page.locator('#mistakes')).toHaveText('0');
  // A bucket click with nothing selected would say "Select a tile first": it must not have happened.
  await expect(page.locator('#sortMsg')).toContainText('placed in');

  // Tap-select by touch, then an immediate mouse click at the same point: still selected.
  const tapAt = await center(trayTile(page, b));
  await touch(cdp, 'touchStart', [{ ...tapAt, id: 4 }]);
  await touch(cdp, 'touchEnd', []);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tapAt.x, y: tapAt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tapAt.x, y: tapAt.y, button: 'left', clickCount: 1 });
  await expect(trayTile(page, b)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drag-preview')).toHaveCount(0);

  // After the window passes, a real mouse click works again (toggles it off).
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tapAt.x, y: tapAt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tapAt.x, y: tapAt.y, button: 'left', clickCount: 1 });
  await expect(trayTile(page, b)).toHaveAttribute('aria-pressed', 'false');
});

test('e) a short tap selects rather than drags; tap a bucket to place', async ({ page }) => {
  await setup(page);
  const [z] = (await trayZs(page)) as [number];
  const at = await center(trayTile(page, z));
  await touch(cdp, 'touchStart', [{ ...at, id: 5 }]);
  await touch(cdp, 'touchMove', [{ x: at.x + 3, y: at.y + 2, id: 5 }]); // jitter under the threshold
  await touch(cdp, 'touchEnd', []);
  await expect(trayTile(page, z)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  await expect(trayTile(page, z)).toBeVisible();
  expect(await bodyStyles(page)).toEqual({ userSelect: '', cursor: '' });

  await page.waitForTimeout(600); // let the post-touch mouse window pass, as a real second tap would
  const b = await center(bucket(page, familyOf(z)));
  await touch(cdp, 'touchStart', [{ ...b, id: 6 }]);
  await touch(cdp, 'touchEnd', []);
  await expect(page.locator('#placed')).toHaveText('1');
});

test('f) a drag that starts outside the tiles scrolls the page', async ({ page }) => {
  errors = trackErrors(page);
  await page.goto('./');
  await openSort(page);
  cdp = await page.context().newCDPSession(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Start on the page heading (not a tile) and swipe up.
  const start = await center(page.locator('h1'));
  const p = { ...start, id: 9 };
  await touch(cdp, 'touchStart', [p]);
  await touchMoveSteps(cdp, p, { x: p.x, y: p.y - 300 }, 12);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(page.locator('.drag-preview')).toHaveCount(0);
});
