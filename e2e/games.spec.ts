import { expect, test } from '@playwright/test';
import { massPoints } from '../src/lib/scoring';
import { answer, currentElement, nextQuestion, openGame, trackErrors } from './helpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await page.goto('./');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test.describe('Name them all', () => {
  test('three names lock in, the count and tiles update, typos do not', async ({ page }) => {
    await openGame(page, 'nameAll');
    const input = page.locator('#nameIn');
    await expect(input).toBeFocused();
    await expect(page.locator('#clock')).toHaveText('12:00');

    // Exact-only: a 1-letter typo must not lock in.
    await input.pressSequentially('hydrogn');
    await expect(page.locator('#count')).toHaveText('0');
    await expect(input).toHaveValue('hydrogn');
    await input.fill('');

    // Typed key by key: the name locks in the moment it's spelled right.
    await input.pressSequentially('Hydrogen');
    await expect(input).toHaveValue('');
    await expect(page.locator('#count')).toHaveText('1');

    await input.pressSequentially('helium');
    await input.pressSequentially('aluminium'); // alternate spelling
    await expect(page.locator('#count')).toHaveText('3');
    for (const z of [1, 2, 13]) {
      await expect(page.locator(`#c${z}`)).toHaveClass(/found/);
    }
    await expect(page.locator('#c1 .cs')).toHaveText('H');
    await expect(page.locator('#c13 .cs')).toHaveText('Al');
    await expect(page.locator('.cell.found')).toHaveCount(3);

    // Typing a found name again does nothing.
    await input.pressSequentially('helium');
    await expect(page.locator('#count')).toHaveText('3');
    await expect(input).toHaveValue('helium');
  });

  test('clock starts on the first keystroke; time-out reveals the missed ones', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await openGame(page, 'nameAll');
    await page.clock.runFor(5000);
    await expect(page.locator('#clock')).toHaveText('12:00'); // not started yet

    await page.locator('#nameIn').pressSequentially('neon');
    await page.clock.runFor(3000);
    await expect(page.locator('#clock')).toHaveText('11:57');

    await page.clock.runFor(12 * 60 * 1000);
    await expect(page.locator('#clock')).toHaveText('0:00');
    await expect(page.locator('#nameIn')).toBeDisabled();
    await expect(page.locator('.cell.missed')).toHaveCount(117);
    await expect(page.locator('#c10')).not.toHaveClass(/missed/);
    await expect(page.locator('#c26 .cs')).toHaveText('Fe');
    await expect(page.locator('#fillHint')).toContainText('You named 1 of 118 with 0:00 left. Best: 1.');
    expect(await page.evaluate(() => localStorage.getItem('eldrills:v1:best:nameAll'))).toBe('1');
  });

  test('Give up reveals missed elements and saves the best count', async ({ page }) => {
    await openGame(page, 'nameAll');
    await page.locator('#nameIn').pressSequentially('carbon');
    await page.locator('#nameIn').pressSequentially('oxygen');
    await page.getByRole('button', { name: 'Give up' }).click();
    await expect(page.locator('.cell.missed')).toHaveCount(116);
    await expect(page.locator('#fillHint')).toContainText('You named 2 of 118');
    await expect(page.locator('#fillHint')).toContainText('Best: 2');
    await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('eldrills:v1:best:nameAll'))).toBe('2');

    await page.keyboard.press('Enter');
    await expect(page.locator('#count')).toHaveText('0');
    await expect(page.locator('.cell.missed')).toHaveCount(0);
  });
});

test.describe('quiz modes', () => {
  test('Symbol to name: right and wrong', async ({ page }) => {
    await openGame(page, 'symbolToName');
    const tile = page.locator('#tileSlot .tile');
    await expect(tile.locator('.t-name')).toHaveText('?');
    await expect(tile.locator('.t-num')).toHaveText('?');

    let e = await currentElement(page);
    await expect(tile.locator('.t-sym')).toHaveText(e.symbol);
    await answer(page, e.name.toUpperCase());
    await expect(page.locator('#fb')).toHaveText(`Correct: ${e.name}, ${e.symbol}, number ${e.z}.`);
    await expect(page.locator('#fb')).toHaveClass(/good/);
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#streak')).toHaveText('1');
    // The tile reveals every field after answering.
    await expect(tile.locator('.t-name')).toHaveText(e.name);
    await expect(tile.locator('.t-num')).toHaveText(String(e.z));
    await expect(tile.locator('.t-mass')).toHaveText(e.massText);
    await nextQuestion(page);

    e = await currentElement(page);
    await answer(page, 'xqzwv');
    await expect(page.locator('#fb')).toHaveText(`It's ${e.name} (${e.symbol}), atomic number ${e.z}.`);
    await expect(page.locator('#fb')).toHaveClass(/bad/);
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#streak')).toHaveText('0');
  });

  test('Number to element: symbol (any case) and name accepted, wrong rejected', async ({ page }) => {
    await openGame(page, 'numberToElement');
    const tile = page.locator('#tileSlot .tile');
    let e = await currentElement(page);
    await expect(tile.locator('.t-num')).toHaveText(String(e.z));
    await expect(tile.locator('.t-sym')).toHaveText('?');

    await answer(page, e.symbol.toLowerCase());
    await expect(page.locator('#fb')).toHaveText(`Correct: ${e.name}, ${e.symbol}, number ${e.z}.`);
    await expect(page.locator('#score')).toHaveText('1');
    await nextQuestion(page);

    e = await currentElement(page);
    await answer(page, e.name);
    await expect(page.locator('#score')).toHaveText('2');
    await expect(page.locator('#streak')).toHaveText('2');
    await nextQuestion(page);

    e = await currentElement(page);
    await answer(page, 'Zz');
    await expect(page.locator('#fb')).toHaveText(`It's ${e.name} (${e.symbol}), atomic number ${e.z}.`);
    await expect(page.locator('#fb')).toHaveClass(/bad/);
    await expect(page.locator('#score')).toHaveText('2');
    await expect(page.locator('#streak')).toHaveText('0');
  });

  test('Element to number: decimal keypad, right and wrong', async ({ page }) => {
    await openGame(page, 'elementToNumber');
    await expect(page.locator('#ans')).toHaveAttribute('inputmode', 'decimal');
    let e = await currentElement(page);
    await answer(page, String(e.z));
    await expect(page.locator('#fb')).toHaveClass(/good/);
    await expect(page.locator('#score')).toHaveText('1');
    await nextQuestion(page);

    e = await currentElement(page);
    await answer(page, String(e.z + 1));
    await expect(page.locator('#fb')).toHaveText(`It's ${e.name} (${e.symbol}), atomic number ${e.z}.`);
    await expect(page.locator('#score')).toHaveText('1');
  });

  test('Guess the mass: exact guess and far-off guess match the formula', async ({ page }) => {
    await openGame(page, 'guessMass');
    await expect(page.locator('#streak')).toHaveCount(0);
    await expect(page.locator('.ask .hint')).toContainText('roughly twice the atomic number');
    await expect(page.locator('#tileSlot .t-mass')).toHaveText('?');

    let e = await currentElement(page);
    await answer(page, String(e.mass));
    const exact = massPoints(e.mass, e.mass);
    expect(exact).toBe(100);
    await expect(page.locator('#fb')).toContainText(`${e.name} is ${e.massText} u. You said ${e.mass}: 100 points.`);
    await expect(page.locator('#score')).toHaveText('100');
    await nextQuestion(page);

    e = await currentElement(page);
    const far = e.mass * 3 + 50;
    const farPoints = massPoints(e.mass, far);
    expect(farPoints).toBe(0);
    await answer(page, String(far));
    await expect(page.locator('#fb')).toContainText(`: ${farPoints} points.`);
    await expect(page.locator('#fb')).toHaveClass(/bad/);
    await expect(page.locator('#score')).toHaveText('100');
    await nextQuestion(page);

    // A partial-credit guess, checked against the formula.
    e = await currentElement(page);
    const tol = Math.max(2, 0.08 * e.mass);
    const near = Math.round((e.mass + tol / 4) * 100) / 100;
    const nearPoints = massPoints(e.mass, near);
    await answer(page, String(near));
    await expect(page.locator('#fb')).toContainText(`: ${nearPoints} points.`);
    await expect(page.locator('#score')).toHaveText(String(100 + nearPoints));
  });

  test('synthetic elements show bracketed mass and the isotope note', async ({ page }) => {
    // Switch to all 118 and play until a synthetic element comes up.
    await openGame(page, 'guessMass');
    await page.locator('.seg button[data-range="118"]').click();
    for (let i = 0; i < 10; i++) {
      const e = await currentElement(page);
      await answer(page, '1');
      if (e.synthetic) {
        await expect(page.locator('#fb')).toContainText(`${e.massText} u`);
        await expect(page.locator('#fb')).toContainText('Bracketed masses are the most stable isotope.');
        return;
      }
      await expect(page.locator('#fb')).not.toContainText('Bracketed');
      await nextQuestion(page);
    }
    test.info().annotations.push({ type: 'note', description: 'no synthetic element drawn this run' });
  });

  test('a full round reaches results with missed tiles and a saved best', async ({ page }) => {
    await openGame(page, 'symbolToName');
    await page.locator('.seg button[data-range="20"]').click();
    const wrong: number[] = [];
    for (let q = 1; q <= 10; q++) {
      await expect(page.locator('#qnum')).toHaveText(String(q));
      const e = await currentElement(page);
      if (q % 3 === 0) {
        wrong.push(e.z);
        await answer(page, 'nope');
      } else {
        await answer(page, e.name);
      }
      await expect(page.locator('#go')).toHaveText(q < 10 ? 'Next' : 'See results');
      await nextQuestion(page);
    }
    await expect(page.locator('#finalScore')).toHaveText('7 of 10');
    await expect(page.locator('.result .hint')).toHaveText('Best for elements 1–20: 7');
    await expect(page.locator('.misses .tile')).toHaveCount(3);
    for (const z of wrong) await expect(page.locator(`.misses .tile[data-z="${z}"]`)).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem('eldrills:v1:best:symbolToName:20')),
    ).toBe('7');
    await expect(page.locator('#again')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#qnum')).toHaveText('1');
    await expect(page.locator('#score')).toHaveText('0');
  });

  test('switching range mid-round restarts the round and is remembered', async ({ page }) => {
    await openGame(page, 'elementToNumber');
    await expect(page.locator('.seg button[data-range="36"]')).toHaveAttribute('aria-pressed', 'true');
    const e = await currentElement(page);
    await answer(page, String(e.z));
    await nextQuestion(page);
    await expect(page.locator('#qnum')).toHaveText('2');
    await expect(page.locator('#score')).toHaveText('1');

    await page.locator('.seg button[data-range="20"]').click();
    await expect(page.locator('#qnum')).toHaveText('1');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#streak')).toHaveText('0');
    await expect(page.locator('#fb')).toHaveText('');
    await expect(page.locator('.seg button[data-range="20"]')).toHaveAttribute('aria-pressed', 'true');

    // Every question in the new round comes from 1–20.
    for (let q = 0; q < 10; q++) {
      expect((await currentElement(page)).z).toBeLessThanOrEqual(20);
      await answer(page, '0');
      await nextQuestion(page);
    }
    expect(await page.evaluate(() => localStorage.getItem('eldrills:v1:range'))).toBe('20');
    await page.reload();
    await openGame(page, 'symbolToName');
    await expect(page.locator('.seg button[data-range="20"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('empty answers are ignored', async ({ page }) => {
    await openGame(page, 'symbolToName');
    await answer(page, '   ');
    await expect(page.locator('#fb')).toHaveText('');
    await expect(page.locator('#go')).toHaveText('Check');
  });
});

test('whole flow is keyboard playable', async ({ page }) => {
  // Tab from the top of the page to the first quiz picker button.
  await page.keyboard.press('Tab');
  await expect(page.locator('.mode[data-game="nameAll"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.mode[data-game="symbolToName"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ans')).toBeFocused();
  const e = await currentElement(page);
  await page.keyboard.type(e.name);
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).toHaveText('1');
  await expect(page.locator('#go')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#qnum')).toHaveText('2');
  await expect(page.locator('#ans')).toBeFocused();
});
