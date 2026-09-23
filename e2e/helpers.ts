import { expect, type Page } from '@playwright/test';
import { elementByZ, type Element } from '../src/data/elements';

/** Collects uncaught page errors and console errors so tests can assert none happened. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

export async function openGame(page: Page, gameId: string): Promise<void> {
  await page.locator(`.mode[data-game="${gameId}"]`).click();
  await expect(page.locator(`.mode[data-game="${gameId}"]`)).toHaveAttribute('aria-pressed', 'true');
}

/** The element currently on the prompt tile (read from its data-z). */
export async function currentElement(page: Page): Promise<Element> {
  const z = Number(await page.locator('#tileSlot .tile').getAttribute('data-z'));
  return elementByZ(z);
}

export async function answer(page: Page, text: string): Promise<void> {
  await page.locator('#ans').fill(text);
  await page.locator('#ans').press('Enter');
}

/** Enter again moves on (focus is on the Next button after answering). */
export async function nextQuestion(page: Page): Promise<void> {
  await expect(page.locator('#go')).toBeFocused();
  await page.keyboard.press('Enter');
}

/** Makes every localStorage access throw, including the window.localStorage getter. */
export const BLOCK_STORAGE = () => {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: boom });
  Storage.prototype.getItem = boom;
  Storage.prototype.setItem = boom;
  Storage.prototype.removeItem = boom;
};
