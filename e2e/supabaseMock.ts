// A fake Supabase for e2e: the build points at https://e2e.supabase.invalid
// (.env.e2e), and these helpers answer its auth and RPC calls in the page.
// It exercises the client wiring only. The real server rules (submit_run's
// checks, RLS) are tested against a real project by `npm run test:rpc`.

import type { Page, Request } from '@playwright/test';

export const SUPABASE_ORIGIN = 'https://e2e.supabase.invalid';
export const AUTH_KEY = 'eldrills-auth';

/** Every request the page made to the fake Supabase host. */
export function trackSupabase(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (req.url().startsWith(SUPABASE_ORIGIN)) seen.push(req);
  });
  return seen;
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const FAKE_ACCESS_TOKEN = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
  sub: '00000000-0000-4000-8000-000000000001',
  role: 'authenticated',
  exp: 4102444800,
})}.fake-signature`;

/** Puts a stored, unexpired session in localStorage before the app loads. */
export async function seedSession(page: Page): Promise<void> {
  const session = {
    access_token: FAKE_ACCESS_TOKEN,
    refresh_token: 'fake-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800, // 2100: never refreshed during a test
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // storage-blocked tests don't seed
      }
    },
    [AUTH_KEY, JSON.stringify(session)] as const,
  );
}

export interface BoardRow {
  rank: number;
  username: string;
  named: number;
  time_ms: number;
  submitted_at: string;
  is_me: boolean;
}

export interface FakeServer {
  username: string | null;
  /** Rows returned by get_leaderboard, keyed by `${game}:${period}`. */
  boards: Map<string, BoardRow[]>;
  submissions: { game: string; runId: string; events: { name: string; t: number }[] }[];
  otpRequests: { email: string; redirectTo: string | null }[];
  unexpected: string[];
  authHeaders: string[];
}

/** Routes every call to the fake host. Anything unexpected is recorded and answered 500. */
export async function mockSupabase(page: Page, init: Partial<FakeServer> = {}): Promise<FakeServer> {
  const s: FakeServer = {
    username: null,
    boards: new Map(),
    submissions: [],
    otpRequests: [],
    unexpected: [],
    authHeaders: [],
    ...init,
  };
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders() });
    const body = req.postDataJSON() as Record<string, unknown> | null;
    const headers = corsHeaders();
    const reply = (b: unknown, status = 200) => route.fulfill({ ...json(b, status), headers });

    if (url.pathname === '/auth/v1/otp') {
      s.otpRequests.push({ email: String(body?.email ?? ''), redirectTo: url.searchParams.get('redirect_to') });
      return reply({});
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers });

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc) s.authHeaders.push(req.headers()['authorization'] ?? '');
    switch (rpc) {
      case 'get_my_profile':
        return reply(s.username ? { username: s.username } : null);
      case 'create_profile': {
        const name = String(body?.p_username ?? '');
        if (body?.p_age_confirmed !== true) return reply({ ok: false, reason: 'age_not_confirmed' });
        if (name === 'taken_name') return reply({ ok: false, reason: 'username_taken' });
        s.username = name;
        return reply({ ok: true, username: name });
      }
      case 'start_run':
        return reply({ ok: true, run_id: `run-${String(body?.p_game_id)}` });
      case 'submit_run': {
        const game = String(body?.p_game_id);
        const events = body?.p_events as { name: string; t: number }[];
        s.submissions.push({ game, runId: String(body?.p_run_id), events });
        const timeMs = events.at(-1)?.t ?? 0;
        for (const period of ['all', 'week']) {
          const key = `${game}:${period}`;
          const rows = (s.boards.get(key) ?? []).filter((r) => !r.is_me);
          const mine: BoardRow = {
            rank: 0,
            username: s.username ?? '',
            named: events.length,
            time_ms: timeMs,
            submitted_at: new Date().toISOString(),
            is_me: true,
          };
          const all = [...rows, mine].sort((a, b) => b.named - a.named || a.time_ms - b.time_ms);
          s.boards.set(key, all.map((r, i) => ({ ...r, rank: i + 1 })));
        }
        const rankOf = (p: string) => s.boards.get(`${game}:${p}`)?.find((r) => r.is_me)?.rank ?? null;
        return reply({ ok: true, named: events.length, time_ms: timeMs, rank_all: rankOf('all'), rank_week: rankOf('week') });
      }
      case 'get_my_best': {
        const game = String(body?.p_game_id);
        const pick = (p: string) => {
          const r = s.boards.get(`${game}:${p}`)?.find((x) => x.is_me);
          return r ? { rank: r.rank, named: r.named, time_ms: r.time_ms, submitted_at: r.submitted_at } : null;
        };
        return reply({ all: pick('all'), week: pick('week') });
      }
      case 'get_leaderboard': {
        const rows = s.boards.get(`${String(body?.p_game_id)}:${String(body?.p_period)}`) ?? [];
        return reply(rows.filter((r) => r.rank <= 50 || r.is_me));
      }
    }
    s.unexpected.push(`${req.method()} ${url.pathname}`);
    return reply({ message: 'unexpected in e2e mock' }, 500);
  });
  return s;
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

/** Filler rows for a board: `n` other players, times ascending from `startMs` by `stepMs`. */
export function fillerRows(n: number, startMs: number, named = 118, stepMs = 1000): BoardRow[] {
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    username: `player_${String(i + 1).padStart(2, '0')}`,
    named,
    time_ms: startMs + i * stepMs,
    submitted_at: '2026-09-21T10:00:00Z',
    is_me: false,
  }));
}
