import { expect, test, type Page } from '@playwright/test';
import { ELEMENTS } from '../src/data/elements';
import { openGame, trackErrors } from './helpers';
import { fillerRows, FAKE_ACCESS_TOKEN, mockSupabase, seedSession, trackSupabase } from './supabaseMock';

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = trackErrors(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const ascending = ELEMENTS.map((e) => e.name);
const descending = [...ascending].reverse();

/** Types each name whole (one input event per name), checking the count after each. */
async function typeAll(page: Page, names: readonly string[]) {
  const input = page.locator('#nameIn');
  for (const [i, name] of names.entries()) {
    await input.fill(name);
    await expect(page.locator('#count')).toHaveText(String(i + 1));
  }
}

for (const [gameId, names, first, second] of [
  ['nameInOrder', ascending, 'Hydrogen', 'Helium'],
  ['reverseOrder', descending, 'Oganesson', 'Tennessine'],
] as const) {
  test.describe(gameId, () => {
    test('signed out: a full run, with zero requests to Supabase', async ({ page }) => {
      const supabase = trackSupabase(page);
      await page.goto('./');
      await openGame(page, gameId);
      const input = page.locator('#nameIn');
      await expect(input).toBeFocused();
      await expect(page.locator('#clock')).toHaveText('0:00');
      await expect(page.locator('#next')).toHaveText(`Next: #${gameId === 'nameInOrder' ? 1 : 118}`);

      // Out of order: rejected, and the input is NOT cleared.
      await input.fill(second);
      await expect(page.locator('#count')).toHaveText('0');
      await expect(input).toHaveValue(second);
      // A 1-letter typo of the right one: rejected too (exact only).
      await input.fill(first.slice(0, -1));
      await expect(page.locator('#count')).toHaveText('0');

      await typeAll(page, names);
      await expect(page.locator('#fillHint')).toContainText('You named all 118 in');
      await expect(page.locator('.cell.found')).toHaveCount(118);
      await expect(page.locator('.cell.missed')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
      await expect(page.locator('#signInToSubmit')).toHaveText('Sign in to submit');

      const best = await page.evaluate((id) => localStorage.getItem(`eldrills:v1:best:${id}`), gameId);
      expect(Number(best)).toBeGreaterThan(0);
      expect(supabase.map((r) => r.url())).toEqual([]);
    });

    test('alternate spellings count, the clock counts up from the first keystroke', async ({ page }) => {
      await page.clock.install();
      await page.goto('./');
      await openGame(page, gameId);
      await page.clock.runFor(5000);
      await expect(page.locator('#clock')).toHaveText('0:00'); // not started yet
      await page.locator('#nameIn').pressSequentially(first.slice(0, 2));
      await page.clock.runFor(3000);
      await expect(page.locator('#clock')).toHaveText('0:03');

      const alt = gameId === 'nameInOrder' ? 13 : 55; // aluminium / caesium
      const upTo = names.slice(0, names.indexOf(ELEMENTS[alt - 1]?.name ?? ''));
      await page.locator('#nameIn').fill('');
      await typeAll(page, upTo);
      await page.locator('#nameIn').fill(alt === 13 ? 'aluminium' : 'caesium');
      await expect(page.locator('#count')).toHaveText(String(upTo.length + 1));
      await expect(page.locator(`#c${alt}`)).toHaveClass(/found/);
    });

    test('give up ends the run unranked, with no best saved', async ({ page }) => {
      await page.goto('./');
      await openGame(page, gameId);
      await page.locator('#nameIn').fill(first);
      await page.getByRole('button', { name: 'Give up' }).click();
      await expect(page.locator('#fillHint')).toContainText('You reached 1 of 118');
      await expect(page.locator('#fillHint')).toContainText('unranked');
      await expect(page.locator('.cell.missed')).toHaveCount(117);
      await expect(page.locator('#signInToSubmit')).toHaveCount(0);
      expect(await page.evaluate((id) => localStorage.getItem(`eldrills:v1:best:${id}`), gameId)).toBeNull();
    });
  });
}

test('signed out: Name Them All and a quiz make no Supabase requests either', async ({ page }) => {
  const supabase = trackSupabase(page);
  await page.goto('./');
  await openGame(page, 'nameAll');
  await page.locator('#nameIn').fill('hydrogen');
  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.locator('#signInToSubmit')).toBeVisible();
  await openGame(page, 'symbolToName');
  expect(supabase).toEqual([]);
});

test('sign in: the magic link returns to the base path, and the email is never shown', async ({ page }) => {
  const server = await mockSupabase(page);
  await page.goto('./');
  await page.locator('#openAccount').click();
  await page.locator('#email').fill('student@example.com');
  await page.locator('#sendLink').click();
  await expect(page.locator('#linkSent')).toBeVisible();
  expect(server.otpRequests).toEqual([
    { email: 'student@example.com', redirectTo: 'http://localhost:4317/chemdrills/' },
  ]);
  await expect(page.locator('body')).not.toContainText('student@example.com');
  expect(server.unexpected).toEqual([]);
});

test('first sign-in: a username (cleaned) and the 13+ box are required', async ({ page }) => {
  await seedSession(page);
  const server = await mockSupabase(page, { username: null });
  await page.goto('./');
  // Returning from the magic link with no profile goes straight to the username form.
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill('Neon Fan!');
  await expect(page.locator('#username')).toHaveValue('neonfan');
  await page.locator('#saveProfile').click();
  await expect(page.locator('.account .fb')).toHaveText('Please confirm you are 13 or older.');
  await page.locator('#age13').check();
  await page.locator('#saveProfile').click();
  await expect(page.locator('#whoami')).toHaveText('@neonfan');
  await expect(page.locator('#openAccount')).toHaveText('@neonfan');
  expect(server.username).toBe('neonfan');
  expect(server.unexpected).toEqual([]);
});

test('signed in: submit a Name In Order run and see it on the board', async ({ page }) => {
  await seedSession(page);
  const server = await mockSupabase(page, {
    username: 'neonfan',
    // Three faster players (a few ms: faster than any real run), so this run ranks #4.
    boards: new Map([['nameInOrder:all', fillerRows(3, 1, 118, 1)]]),
  });
  await page.goto('./');
  await expect(page.locator('#openAccount')).toHaveText('@neonfan');

  await openGame(page, 'nameInOrder');
  await typeAll(page, ascending);
  await page.locator('#submitRun').click();
  await expect(page.locator('.submit-status')).toHaveText(/^Submitted\. Your rank: #4 all-time, #1 this week\.$/);
  await expect(page.locator('#myRank')).toContainText('rank #4 all-time');

  // The server got the run token from start_run and every accepted entry, in order, with rising times.
  expect(server.submissions).toHaveLength(1);
  const sub = server.submissions[0];
  expect(sub?.runId).toBe('run-nameInOrder');
  expect(sub?.events.map((e) => e.name)).toEqual(ascending);
  const times = sub?.events.map((e) => e.t) ?? [];
  expect(times.every((t, i) => i === 0 || t >= (times[i - 1] ?? 0))).toBe(true);
  // Requests carried the signed-in user's token.
  expect(server.authHeaders.every((h) => h === `Bearer ${FAKE_ACCESS_TOKEN}`)).toBe(true);

  await page.locator('#openBoard').click();
  await page.getByRole('tab', { name: 'Name in order' }).click();
  const me = page.locator('.board-table tr.me');
  await expect(me).toHaveCount(1);
  await expect(me).toContainText('@neonfan');
  await expect(me.locator('td').first()).toHaveText('4');
  await expect(page.locator('.board-table tbody tr')).toHaveCount(4);
  expect(server.unexpected).toEqual([]);
});

test('leaderboard: top 50 plus your own row pinned below', async ({ page }) => {
  await seedSession(page);
  const rows = fillerRows(60, 100_000, 100);
  rows[56] = { ...rows[56]!, username: 'neonfan', is_me: true };
  await mockSupabase(page, { username: 'neonfan', boards: new Map([['nameAll:all', rows]]) });
  await page.goto('./');
  await page.locator('#openBoard').click();
  await expect(page.getByRole('tab', { name: 'Name them all' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.board-table tbody tr[data-rank]')).toHaveCount(51);
  await expect(page.locator('.board-gap')).toHaveCount(1);
  await expect(page.locator('.board-table tr.me')).toHaveAttribute('data-rank', '57');
  await expect(page.locator('.board-table thead')).toContainText('Named');

  await page.getByRole('button', { name: 'This week' }).click();
  await expect(page.locator('#boardPanel')).toContainText('No runs yet this week');
});

test('sign out returns to signed-out, local bests untouched', async ({ page }) => {
  await seedSession(page);
  await mockSupabase(page, { username: 'neonfan' });
  await page.addInitScript(() => localStorage.setItem('eldrills:v1:best:nameAll', '42'));
  await page.goto('./');
  await page.locator('#openAccount').click();
  await page.locator('#signOut').click();
  await expect(page.locator('#openAccount')).toHaveText('Sign in');
  expect(await page.evaluate(() => localStorage.getItem('eldrills-auth'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('eldrills:v1:best:nameAll'))).toBe('42');
});
