import { expect, test } from '@playwright/test';
import { answer, BLOCK_STORAGE, currentElement, nextQuestion, openGame, trackErrors } from './helpers';

// Every localStorage access throws (like Safari private mode or blocked
// site data). Every game must still work, with no uncaught errors.
test('all games work with localStorage throwing', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(BLOCK_STORAGE);
  await page.goto('./');

  // Sanity: storage really is blocked in this page.
  const blocked = await page.evaluate(() => {
    try {
      window.localStorage.getItem('x');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  await expect(page.locator('h1')).toHaveText('Element Drills');

  // Name them all, through to the end screen (which tries to save the best).
  await openGame(page, 'nameAll');
  await page.locator('#nameIn').pressSequentially('iron');
  await expect(page.locator('#count')).toHaveText('1');
  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.locator('#fillHint')).toContainText('Best: 1');

  // Each quiz, a full round to results (reads and writes best + range).
  for (const id of ['symbolToName', 'numberToElement', 'elementToNumber', 'guessMass']) {
    await openGame(page, id);
    await expect(page.locator('#qnum')).toHaveText('1');
    for (let q = 0; q < 10; q++) {
      const e = await currentElement(page);
      const right = id === 'elementToNumber' ? String(e.z) : id === 'guessMass' ? String(e.mass) : e.name;
      await answer(page, right);
      await nextQuestion(page);
    }
    const expected = id === 'guessMass' ? '1000 of 1000' : '10 of 10';
    await expect(page.locator('#finalScore')).toHaveText(expected);
    await expect(page.locator('.result .hint')).toContainText('Best for elements 1–36:');
  }

  // Range switch still works (the write fails silently, state stays in memory).
  await page.locator('.seg button[data-range="54"]').click();
  await expect(page.locator('.seg button[data-range="54"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#qnum')).toHaveText('1');

  expect(errors).toEqual([]);
});
