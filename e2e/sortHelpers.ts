import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { elementByZ } from '../src/data/elements';

export async function openSort(page: Page): Promise<void> {
  await page.locator('.mode[data-game="familySort"]').click();
  await expect(page.locator('#tray')).toBeVisible();
}

export const trayTile = (page: Page, z: number): Locator => page.locator(`.tray-tile[data-tray-z="${z}"]`);
export const bucket = (page: Page, id: string): Locator => page.locator(`.bucket[data-bucket="${id}"]`);

export async function trayZs(page: Page): Promise<number[]> {
  return page.locator('.tray-tile').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.trayZ)));
}

export async function bucketIds(page: Page): Promise<string[]> {
  return page.locator('.bucket').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.bucket ?? ''));
}

export const familyOf = (z: number): string => elementByZ(z).family;

/** Some visible bucket that is NOT this element's family. */
export async function wrongBucketFor(page: Page, z: number): Promise<string> {
  const ids = await bucketIds(page);
  const wrong = ids.find((id) => id !== familyOf(z));
  if (!wrong) throw new Error('no wrong bucket available');
  return wrong;
}

export async function center(loc: Locator): Promise<{ x: number; y: number }> {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Real mouse drag: press on `from`, move in steps, release over `to`. */
export async function mouseDrag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  const a = await center(from);
  const b = 'x' in to ? to : await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 4, a.y + 4, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

/** Scroll so the tray's top sits near the top of the viewport. */
export async function scrollTrayToTop(page: Page) {
  await page.evaluate(() => {
    const tray = document.getElementById('tray');
    if (tray) window.scrollTo(0, tray.getBoundingClientRect().top + window.scrollY - 60);
  });
}

// ---- CDP touch: real touch sequences through the browser's input pipeline ----

export interface Pt {
  x: number;
  y: number;
  id: number;
}

export async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Pt[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
  });
}

/** Move one finger in steps while other fingers (`others`) stay put. */
export async function touchMoveSteps(cdp: CDPSession, from: Pt, to: { x: number; y: number }, steps = 8, others: Pt[] = []) {
  let last = from;
  for (let i = 1; i <= steps; i++) {
    last = { id: from.id, x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await touch(cdp, 'touchMove', [...others, last]);
  }
  return last;
}

/** The computed color a CSS custom property resolves to, as rgb(). */
export async function tokenColor(page: Page, cssVar: string): Promise<string> {
  return page.evaluate((v) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${v})`;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, cssVar);
}

export async function bgOf(loc: Locator): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
}
