// npm run test:sql — the server rules, offline, in about a second.
//
// Runs supabase/migrations/*.sql unchanged in PGlite (real Postgres, WASM),
// on top of a stub of what Supabase provides (anon/authenticated roles,
// auth.users, auth.uid() from the JWT subject, and Supabase's default grants
// to client roles, so the migrations' revokes are really exercised), then
// calls every RPC as those roles. Prints each response; exit 1 on a mismatch.
//
// What this does NOT cover (npm run test:rpc against a real project does):
// PostgREST, real JWTs, Supabase's actual role setup. Server time is simulated
// by backdating run_starts.started_at instead of waiting.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = process.argv[2] ?? process.cwd();
const db = new PGlite();
let failures = 0;
const check = (label, got, want) => {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}\n     ${JSON.stringify(got)}`);
};

// ---- Stub of the Supabase environment ----
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase's defaults: client roles get everything on new public objects.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);

// ---- The migrations, byte for byte ----
for (const f of ['0001_accounts_leaderboards.sql', '0002_elements.sql', '0003_blocked_words.sql']) {
  await db.exec(readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8'));
  console.log(`applied ${f}`);
}
check('118 elements seeded', (await db.query('select count(*)::int n from public.elements')).rows[0].n, 118);

const names = (await db.query('select names[1] n from public.elements order by z')).rows.map((r) => r.n);
const mkUser = async (email) =>
  (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
const [A, B, C, D] = [await mkUser('a@x.test'), await mkUser('b@x.test'), await mkUser('c@x.test'), await mkUser('d@x.test')];

/** Run one statement as a client: anon (uid null) or authenticated. Errors come back as {error}. */
async function as(uid, sql, params = []) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try {
    return (await db.query(sql, params)).rows;
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  } finally {
    await db.exec('reset role');
  }
}
const call = async (uid, fn, args) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await as(uid, `select public.${fn}(${ph}) as r`, args);
  return r.error ? r : r[0].r;
};
const plausible = (list) => {
  let t = 0;
  const per = list.map((n) => Math.max(150, 40 * n.length) + 20);
  const sum = per.reduce((a, b) => a + b, 0);
  const floor = (30000 * list.length) / 118;
  const k = sum < floor ? floor / sum + 0.01 : 1;
  return list.map((name, i) => ({ name, t: (t += Math.ceil(per[i] * k)) }));
};
const startRun = async (uid, game) => (await call(uid, 'start_run', [game])).run_id;
/** Pretend the run started `ms` ago (as the server clock would have seen for a real run). */
const backdate = (runId, ms) =>
  db.query(`update public.run_starts set started_at = now() - make_interval(secs => $2::float8 / 1000) where id = $1`, [runId, ms]);
const submit = (uid, game, runId, events) => call(uid, 'submit_run', [game, runId, JSON.stringify(events)]);

console.log('\n== Profiles');
check('A creates a profile', await call(A, 'create_profile', ['Rpc_Test_A', true]), { ok: true, username: 'rpc_test_a' });
check('B creates a profile', await call(B, 'create_profile', ['rpc_test_b', true]), { ok: true, username: 'rpc_test_b' });
check('C creates a profile', await call(C, 'create_profile', ['rpc_test_c', true]), { ok: true, username: 'rpc_test_c' });
check('D: taken, case-insensitively', await call(D, 'create_profile', ['RPC_TEST_A', true]), { ok: false, reason: 'username_taken' });
check('D: blocked word, leetspeak', await call(D, 'create_profile', ['sh1t_head', true]), { ok: false, reason: 'username_not_allowed' });
check('D: too short', await call(D, 'create_profile', ['ab', true]), { ok: false, reason: 'invalid_username' });
check('D: bad characters', await call(D, 'create_profile', ['bad-name', true]), { ok: false, reason: 'invalid_username' });
check('D: no 13+ confirmation', await call(D, 'create_profile', ['fine_name', false]), { ok: false, reason: 'age_not_confirmed' });
check('D: element-ish name passes', await call(D, 'create_profile', ['tin_man', true]), { ok: true, username: 'tin_man' });
check('A: second profile refused', await call(A, 'create_profile', ['another', true]), { ok: false, reason: 'profile_exists' });
check('anon: create_profile not executable', await call(null, 'create_profile', ['x_y_z', true]), (r) => r.error?.code === '42501');
check('get_my_profile never includes email', await call(A, 'get_my_profile', []), { username: 'rpc_test_a' });

console.log('\n== Direct table access (every client role denied)');
const row = `('${A}', 'nameAll', 118, 1, '[]')`;
for (const [who, uid] of [['anon', null], ['authenticated A', A]]) {
  for (const [op, sql] of [
    ['insert scores', `insert into public.scores (user_id, game_id, named, time_ms, events) values ${row}`],
    ['update scores', 'update public.scores set time_ms = 1'],
    ['delete scores', 'delete from public.scores'],
    ['select scores', 'select * from public.scores'],
    ['insert profiles', `insert into public.profiles (user_id, username, age_confirmed_at) values ('${A}', 'zzz', now())`],
    ['insert run_starts', `insert into public.run_starts (user_id, game_id) values ('${A}', 'nameAll')`],
    ['select submissions', 'select * from public.submissions'],
  ]) {
    check(`${who}: ${op} denied`, await as(uid, sql), (r) => r.error?.code === '42501');
  }
}
check('anon: submit_run not executable', await call(null, 'submit_run', ['nameAll', A, '[]']), (r) => r.error?.code === '42501');
check('anon: start_run not executable', await call(null, 'start_run', ['nameAll']), (r) => r.error?.code === '42501');
check('anon: private.board not reachable', await as(null, `select * from private.board('nameAll', 'all')`), (r) => r.error?.code === '42501');
const E = await mkUser('e@x.test');
check('no profile: start_run refused', await call(E, 'start_run', ['nameAll']), { ok: false, reason: 'no_profile' });

console.log('\n== submit_run rejections (user A: 6 submissions, the per-minute limit)');
const rejects = [
  ['wrong entry', 'nameInOrder', plausible(['hydrogen', 'helum']), 'wrong_entry', 0],
  ['skipped element', 'nameInOrder', plausible(['hydrogen', 'lithium']), 'out_of_order', 0],
  ['duplicate', 'nameAll', plausible(['neon', 'argon', 'Neon']), 'duplicate', 0],
  ['impossibly fast entry', 'nameAll', [{ name: 'hydrogen', t: 900 }, { name: 'helium', t: 950 }], 'too_fast', 5000],
  ['over the game limit', 'nameAll', [{ name: 'hydrogen', t: 721000 }], 'over_time_limit', 800000],
  ['longer than the server saw', 'nameAll', [{ name: 'hydrogen', t: 60000 }, { name: 'helium', t: 120000 }], 'time_mismatch', 0],
];
for (const [label, game, events, reason, ago] of rejects) {
  const id = await startRun(A, game);
  if (ago) await backdate(id, ago);
  check(`reject: ${label}`, await submit(A, game, id, events), (r) => r.ok === false && r.reason === reason);
}
check('7th submission within a minute: rate_limited', await submit(A, 'nameAll', await startRun(A, 'nameAll'), plausible(['hydrogen'])), {
  ok: false,
  reason: 'rate_limited',
});

console.log('\n== More rejections (user D)');
{
  const id = await startRun(D, 'nameInOrder');
  await backdate(id, 60000);
  check('reject: ordered run incomplete', await submit(D, 'nameInOrder', id, plausible(names.slice(0, 5))), (r) => r.reason === 'incomplete');
  check('reject: same run replayed', await submit(D, 'nameInOrder', id, plausible(names.slice(0, 5))), (r) => r.reason === 'run_already_used');
  check('reject: someone else\'s run id', await submit(D, 'nameAll', await startRun(B, 'nameAll'), plausible(['hydrogen'])), (r) => r.reason === 'unknown_run');
  const id2 = await startRun(D, 'nameAll');
  check('reject: non-array events', await submit(D, 'nameAll', id2, { name: 'x' }), (r) => r.reason === 'bad_events');
  const id3 = await startRun(D, 'nameAll');
  await backdate(id3, 10000);
  check('reject: non-increasing timestamps', await submit(D, 'nameAll', id3, [{ name: 'hydrogen', t: 900 }, { name: 'helium', t: 900 }]), (r) => r.reason === 'bad_timestamps');
}

console.log('\n== Valid runs are accepted (user B)');
{
  const small = plausible(['Hydrogen', 'helium', 'Aluminium']);
  const id = await startRun(B, 'nameAll');
  await backdate(id, small.at(-1).t + 200);
  check('accept: Name Them All, 3 names (alt spelling)', await submit(B, 'nameAll', id, small), (r) => r.ok === true && r.named === 3 && r.rank_all === 1);

  const up = plausible(names);
  const upId = await startRun(B, 'nameInOrder');
  await backdate(upId, up.at(-1).t + 200);
  check('accept: Name In Order, full 118', await submit(B, 'nameInOrder', upId, up), (r) => r.ok === true && r.named === 118);

  const down = plausible([...names].reverse());
  const downId = await startRun(B, 'reverseOrder');
  await backdate(downId, down.at(-1).t + 200);
  check('accept: Reverse Order, full 118', await submit(B, 'reverseOrder', downId, down), (r) => r.ok === true && r.named === 118);

  const wrongWay = plausible(names);
  const wwId = await startRun(B, 'reverseOrder');
  await backdate(wwId, wrongWay.at(-1).t + 200);
  check('reject: ascending run submitted as Reverse Order', await submit(B, 'reverseOrder', wwId, wrongWay), (r) => r.reason === 'out_of_order');
}

console.log('\n== Leaderboard');
{
  // C: same count as B on nameAll but slower; then D ties B exactly (later submission).
  const cRun = plausible(['hydrogen', 'helium', 'lithium']).map((e) => ({ ...e, t: e.t + 5000 }));
  const cId = await startRun(C, 'nameAll');
  await backdate(cId, cRun.at(-1).t + 200);
  check('accept: C slower, same count', await submit(C, 'nameAll', cId, cRun), (r) => r.ok && r.rank_all === 2);

  const bBest = (await db.query(`select time_ms from public.scores where game_id = 'nameAll' and user_id = $1`, [B])).rows[0].time_ms;
  const tie = plausible(['neon', 'argon', 'xenon']);
  const scale = bBest / tie.at(-1).t;
  const tieRun = tie.map((e, i) => ({ ...e, t: i === tie.length - 1 ? bBest : Math.round(e.t * scale) }));
  const dId = await startRun(D, 'nameAll');
  await backdate(dId, bBest + 200);
  const dRes = await submit(D, 'nameAll', dId, tieRun);
  check('accept: D ties B exactly, submitted later -> ranked after B', dRes, (r) => r.ok && r.time_ms === bBest && r.rank_all === 2);

  const board = await call(null, 'get_leaderboard', ['nameAll', 'all']);
  const anonBoard = await as(null, `select * from public.get_leaderboard('nameAll', 'all')`);
  console.log('     anon board:', JSON.stringify(anonBoard));
  check('anon board order: B, D (tie, earlier wins), C', anonBoard.map((r) => r.username), ['rpc_test_b', 'tin_man', 'rpc_test_c']);
  check('board columns only (no user_id, no email)', Object.keys(anonBoard[0]).sort(), ['is_me', 'named', 'rank', 'submitted_at', 'time_ms', 'username']);
  check('anon: is_me false everywhere', anonBoard.every((r) => r.is_me === false), true);
  check('weekly board has the same runs', (await as(null, `select username from public.get_leaderboard('nameAll', 'week')`)).map((r) => r.username), [
    'rpc_test_b',
    'tin_man',
    'rpc_test_c',
  ]);
  check('bad period returns nothing', await as(null, `select * from public.get_leaderboard('nameAll', 'bogus')`), []);
  void board;

  // Last week's run: on all-time, not on this week.
  await db.query(`update public.scores set submitted_at = now() - interval '8 days' where user_id = $1 and game_id = 'nameAll'`, [C]);
  check('run from 8 days ago: off the weekly board', (await as(null, `select username from public.get_leaderboard('nameAll', 'week')`)).map((r) => r.username), [
    'rpc_test_b',
    'tin_man',
  ]);

  // Top 50 + pinned: 55 players faster than B on nameInOrder.
  for (let i = 0; i < 55; i++) {
    const u = await mkUser(`f${i}@x.test`);
    await db.query(`insert into public.profiles values ($1, $2, now(), now())`, [u, `filler_${i}`]);
    await db.query(`insert into public.scores (user_id, game_id, named, time_ms, events) values ($1, 'nameInOrder', 118, $2, '[]')`, [u, 10000 + i]);
  }
  const bBoard = await as(B, `select rank, username, is_me from public.get_leaderboard('nameInOrder', 'all')`);
  check('51 rows: top 50 plus B pinned', bBoard.length, 51);
  check('B pinned last with is_me, rank 56', bBoard.at(-1), { rank: 56, username: 'rpc_test_b', is_me: true });
  check('get_my_best for B', await call(B, 'get_my_best', ['nameInOrder']), (r) => r.all?.rank === 56 && r.week?.rank === 56 && !('user_id' in r.all));
}

console.log('\n== Rate limit burst (user C: 10 back-to-back)');
{
  // C has used 1 submission this minute.
  const reasons = [];
  for (let i = 0; i < 10; i++) reasons.push((await submit(C, 'nameAll', A, plausible(['hydrogen']))).reason);
  console.log('     reasons:', JSON.stringify(reasons));
  check('first 5 processed (unknown_run), then rate_limited', reasons, [
    ...Array(5).fill('unknown_run'),
    ...Array(5).fill('rate_limited'),
  ]);
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
