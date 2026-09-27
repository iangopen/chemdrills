// Server-rule tests against a REAL Supabase project (npm run test:rpc).
//
// Needs in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and three
// confirmed test users SUPABASE_TEST_{A,B,C}_{EMAIL,PASSWORD}. Uses only the
// anon key and the users' own sessions, exactly what a browser has.
//
// Rate limit is 6 submissions per user per minute, so each user stays within
// it: A = rejections, B = valid runs, C = the burst. Wait a minute between
// runs of this file. Accepted runs land on that project's boards: use a
// separate test project.
//
// Every response is printed, so the run log shows the actual server answers.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ELEMENTS } from '../../src/data/elements';

const env = process.env;
const url = env.VITE_SUPABASE_URL ?? '';
const key = env.VITE_SUPABASE_ANON_KEY ?? '';
const users = (['A', 'B', 'C'] as const).map((u) => ({
  tag: u,
  email: env[`SUPABASE_TEST_${u}_EMAIL`] ?? '',
  password: env[`SUPABASE_TEST_${u}_PASSWORD`] ?? '',
}));
const configured = url !== '' && key !== '' && users.every((u) => u.email && u.password);

const newClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (label: string, value: unknown) => console.log(`${label}:\n  ${JSON.stringify(value)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ev {
  name: string;
  t: number;
}

/** Events that pass the per-entry and total floors (see ranked_games). */
function plausible(names: readonly string[], extraMs = 20): Ev[] {
  let t = 0;
  const floorTotal = (30_000 * names.length) / 118;
  const per = names.map((n) => Math.max(150, 40 * n.toLowerCase().replace(/[^a-z]/g, '').length) + extraMs);
  const sum = per.reduce((a, b) => a + b, 0);
  const stretch = sum < floorTotal ? floorTotal / sum + 0.01 : 1;
  return names.map((name, i) => ({ name, t: (t += Math.ceil((per[i] ?? 0) * stretch)) }));
}

async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args);
  return error ? { error: { code: error.code, message: error.message } } : data;
}

async function start(c: SupabaseClient, game: string): Promise<string> {
  const r = (await rpc(c, 'start_run', { p_game_id: game })) as { ok: boolean; run_id?: string };
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.run_id ?? '';
}

async function submit(c: SupabaseClient, game: string, runId: string, events: unknown) {
  return rpc(c, 'submit_run', { p_game_id: game, p_run_id: runId, p_events: events });
}

const asc = ELEMENTS.map((e) => e.name);
const desc = [...asc].reverse();

describe.skipIf(!configured)('Supabase server rules', () => {
  // Created in beforeAll: the describe body runs at collection time even when skipped.
  let anon: SupabaseClient;
  const as = {} as Record<'A' | 'B' | 'C', SupabaseClient>;

  beforeAll(async () => {
    anon = newClient();
    for (const u of users) as[u.tag] = newClient();
    for (const u of users) {
      const { error } = await as[u.tag].auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw new Error(`sign-in ${u.tag}: ${error.message}`);
      const r = await rpc(as[u.tag], 'create_profile', { p_username: `rpc_test_${u.tag.toLowerCase()}`, p_age_confirmed: true });
      log(`create_profile ${u.tag}`, r);
    }
  });

  describe('no direct writes to scores (RLS + revoked grants)', () => {
    const row = { user_id: '00000000-0000-0000-0000-000000000000', game_id: 'nameAll', named: 118, time_ms: 1, events: [] };

    for (const who of ['anon', 'signed-in A'] as const) {
      it(`${who}: insert, update, delete and select on scores are all denied`, async () => {
        const c = who === 'anon' ? anon : as.A;
        const ins = await c.from('scores').insert(row);
        const upd = await c.from('scores').update({ time_ms: 1 }).gte('id', 0);
        const del = await c.from('scores').delete().gte('id', 0);
        const sel = await c.from('scores').select('*').limit(1);
        for (const [op, r] of Object.entries({ ins, upd, del, sel })) {
          log(`${who} ${op} scores`, { status: r.status, error: r.error });
          expect(r.error, op).not.toBeNull();
          expect(r.error?.code, op).toBe('42501'); // permission denied
        }
      });
    }

    it('signed-in A: direct insert into profiles and run_starts is denied', async () => {
      const p = await as.A.from('profiles').insert({ user_id: '00000000-0000-0000-0000-000000000000', username: 'x_x_x', age_confirmed_at: new Date().toISOString() });
      const s = await as.A.from('run_starts').insert({ user_id: '00000000-0000-0000-0000-000000000000', game_id: 'nameAll' });
      log('A insert profiles', p.error);
      log('A insert run_starts', s.error);
      expect(p.error?.code).toBe('42501');
      expect(s.error?.code).toBe('42501');
    });

    it('anon cannot even call submit_run or start_run', async () => {
      const r1 = await rpc(anon, 'submit_run', { p_game_id: 'nameAll', p_run_id: '00000000-0000-0000-0000-000000000000', p_events: [] });
      const r2 = await rpc(anon, 'start_run', { p_game_id: 'nameAll' });
      log('anon submit_run', r1);
      log('anon start_run', r2);
      expect(r1).toHaveProperty('error.code', '42501');
      expect(r2).toHaveProperty('error.code', '42501');
    });
  });

  describe('profiles', () => {
    it('rejects bad usernames and a missing 13+ confirmation', async () => {
      const cases = {
        blocked: await rpc(as.C, 'create_profile', { p_username: 'sh1t_head', p_age_confirmed: true }),
        tooShort: await rpc(as.C, 'create_profile', { p_username: 'ab', p_age_confirmed: true }),
        badChars: await rpc(as.C, 'create_profile', { p_username: 'bad-name', p_age_confirmed: true }),
        noAge: await rpc(as.C, 'create_profile', { p_username: 'fine_name', p_age_confirmed: false }),
      };
      log('create_profile rejections', cases);
      expect(cases.blocked).toMatchObject({ ok: false, reason: 'username_not_allowed' });
      expect(cases.tooShort).toMatchObject({ ok: false, reason: 'invalid_username' });
      expect(cases.badChars).toMatchObject({ ok: false, reason: 'invalid_username' });
      expect(cases.noAge).toMatchObject({ ok: false, reason: 'age_not_confirmed' });
    });
  });

  describe('submit_run rejects (user A, 6 submissions)', () => {
    const cases: [string, string, (runStarted: number) => Ev[], string][] = [
      ['a wrong entry', 'nameInOrder', () => plausible(['Hydrogen', 'Helum']), 'wrong_entry'],
      ['a skipped element', 'nameInOrder', () => plausible(['Hydrogen', 'Lithium']), 'out_of_order'],
      ['a duplicate', 'nameAll', () => plausible(['Neon', 'Argon', 'neon']), 'duplicate'],
      ['an impossibly fast entry', 'nameAll', () => [{ name: 'Hydrogen', t: 900 }, { name: 'Helium', t: 950 }], 'too_fast'],
      ['a time longer than the game limit', 'nameAll', () => [{ name: 'Hydrogen', t: 721_000 }], 'over_time_limit'],
      [
        'a time longer than the server saw',
        'nameAll',
        () => [{ name: 'Hydrogen', t: 60_000 }, { name: 'Helium', t: 120_000 }],
        'time_mismatch',
      ],
    ];
    for (const [label, game, events, reason] of cases) {
      it(label, async () => {
        const runId = await start(as.A, game);
        const r = await submit(as.A, game, runId, events(Date.now()));
        log(`A ${label}`, r);
        expect(r).toMatchObject({ ok: false, reason });
      });
    }
  });

  describe('valid runs are accepted (user B)', () => {
    it('Name Them All, 3 names', async () => {
      const events = plausible(['Hydrogen', 'Helium', 'Lithium']);
      const runId = await start(as.B, 'nameAll');
      await sleep((events.at(-1)?.t ?? 0) + 200);
      const r = await submit(as.B, 'nameAll', runId, events);
      log('B nameAll valid', r);
      expect(r).toMatchObject({ ok: true, named: 3 });

      const replay = await submit(as.B, 'nameAll', runId, events);
      log('B replay of the same run', replay);
      expect(replay).toMatchObject({ ok: false, reason: 'run_already_used' });
    });

    it('Name In Order and Reverse Order, full 118 (waits out the real time)', async () => {
      const up = plausible(asc);
      const down = plausible(desc);
      const [upId, downId] = [await start(as.B, 'nameInOrder'), await start(as.B, 'reverseOrder')];
      const wait = Math.max(up.at(-1)?.t ?? 0, down.at(-1)?.t ?? 0) + 500;
      console.log(`waiting ${wait} ms of real time so the server clock agrees`);
      await sleep(wait);
      const r1 = await submit(as.B, 'nameInOrder', upId, up);
      const r2 = await submit(as.B, 'reverseOrder', downId, down);
      log('B nameInOrder valid', r1);
      log('B reverseOrder valid', r2);
      expect(r1).toMatchObject({ ok: true, named: 118 });
      expect(r2).toMatchObject({ ok: true, named: 118 });
    }, 180_000);

    it('the board shows B by username only, never an email or user id', async () => {
      const { data, error } = await anon.rpc('get_leaderboard', { p_game_id: 'nameInOrder', p_period: 'all' });
      log('anon get_leaderboard nameInOrder all (first 3)', (data as unknown[] | null)?.slice(0, 3));
      expect(error).toBeNull();
      const rows = data as Record<string, unknown>[];
      const b = rows.find((r) => r.username === 'rpc_test_b');
      expect(b).toBeDefined();
      for (const r of rows) {
        expect(Object.keys(r).sort()).toEqual(['is_me', 'named', 'rank', 'submitted_at', 'time_ms', 'username']);
      }
      expect(JSON.stringify(rows)).not.toContain('@');
    });
  });

  describe('rate limit (user C)', () => {
    it('a burst of 10 submissions: at most 6 are processed, the rest are rate_limited', async () => {
      const bogus = '00000000-0000-0000-0000-000000000000';
      const results = await Promise.all(
        Array.from({ length: 10 }, () => submit(as.C, 'nameAll', bogus, [{ name: 'Hydrogen', t: 500 }])),
      );
      const reasons = results.map((r) => (r as { reason?: string }).reason);
      log('C burst reasons', reasons);
      expect(reasons.filter((r) => r === 'rate_limited').length).toBeGreaterThanOrEqual(4);
      expect(reasons.filter((r) => r !== 'rate_limited').every((r) => r === 'unknown_run')).toBe(true);
    });
  });
});

describe.runIf(!configured)('Supabase server rules (not configured)', () => {
  it('skipped: set VITE_SUPABASE_* and SUPABASE_TEST_* in .env.local', () => {
    console.log('RPC tests skipped: no Supabase config in .env.local');
  });
});
