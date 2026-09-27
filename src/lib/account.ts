// Optional accounts and leaderboards, backed by Supabase.
//
// The app is static, so every rule lives server-side (supabase/migrations/).
// This module is a thin client: it never computes a ranked score, it only
// sends the run's events to submit_run, which re-checks them.
//
// supabase-js is imported lazily, and only when there's a reason to: a stored
// session, an auth redirect in the URL, or the player opening sign-in or the
// leaderboard. Signed-out play makes no request to Supabase at all.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunEvent } from './sequence';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** False when the build has no Supabase config: the accounts UI is hidden and the app is local-only. */
export const accountsEnabled = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

/** Where supabase-js keeps the session. Outside the eldrills:v1: prefix: supabase-js owns its format. */
export const AUTH_STORAGE_KEY = 'eldrills-auth';

// Every storage access is wrapped, like lib/storage.ts: blocked storage means
// "signed out", never a crash.
const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked: the session lasts until reload.
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: safeStorage,
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow: the magic link works even when the email app opens it
        // in a different browser than the one that asked for it (PKCE doesn't).
        flowType: 'implicit',
      },
    }),
  );
  return clientPromise;
}

/** An auth error the magic-link redirect put in the URL (expired link, etc.), if any. */
export function authErrorInUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return params.get('error_description');
  } catch {
    return null;
  }
}

/** Whether loading supabase-js at startup is worthwhile: a stored session or an auth redirect. */
export function hasAuthHint(): boolean {
  if (safeStorage.getItem(AUTH_STORAGE_KEY) !== null) return true;
  try {
    return /(^|[#&])(access_token|error_description)=/.test(window.location.hash);
  } catch {
    return false;
  }
}

/** Magic-link sign-in. The link returns to this app's base path, locally and live. */
export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
  });
  if (!error) return { ok: true };
  if (error.status === 429) return { ok: false, message: 'Too many sign-in emails. Wait a few minutes and try again.' };
  return { ok: false, message: 'Could not send the sign-in email. Check the address and try again.' };
}

export async function signOut(): Promise<void> {
  const client = await getClient();
  // Local scope: clears this device even if the network call fails.
  await client.auth.signOut({ scope: 'local' });
}

// ---------------------------------------------------------------------------
// RPCs. Each returns data or a fallback; a network failure never breaks a game.
// ---------------------------------------------------------------------------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const client = await getClient();
    const { data, error } = await client.rpc(fn, args);
    return error ? null : (data as T);
  } catch {
    return null;
  }
}

export async function getMyUsername(): Promise<string | null> {
  const data = await rpc<{ username: string } | null>('get_my_profile');
  return data?.username ?? null;
}

export type ProfileResult = { ok: true; username: string } | { ok: false; reason: string };

export async function createProfile(username: string, ageConfirmed: boolean): Promise<ProfileResult> {
  const data = await rpc<ProfileResult>('create_profile', {
    p_username: username,
    p_age_confirmed: ageConfirmed,
  });
  return data ?? { ok: false, reason: 'network' };
}

/** Called on a ranked run's first keystroke when signed in. Null = the run can't be ranked. */
export async function startRun(gameId: string): Promise<string | null> {
  const data = await rpc<{ ok: boolean; run_id?: string }>('start_run', { p_game_id: gameId });
  return data?.ok && data.run_id ? data.run_id : null;
}

export type SubmitResult =
  | { ok: true; named: number; time_ms: number; rank_all: number | null; rank_week: number | null }
  | { ok: false; reason: string; detail?: string | null };

export async function submitRun(gameId: string, runId: string, events: readonly RunEvent[]): Promise<SubmitResult> {
  const data = await rpc<SubmitResult>('submit_run', {
    p_game_id: gameId,
    p_run_id: runId,
    p_events: events,
  });
  return data ?? { ok: false, reason: 'network' };
}

export type Period = 'all' | 'week';

export interface BoardRow {
  rank: number;
  username: string;
  named: number;
  time_ms: number;
  submitted_at: string;
  is_me: boolean;
}

export async function getLeaderboard(gameId: string, period: Period): Promise<BoardRow[] | null> {
  return rpc<BoardRow[]>('get_leaderboard', { p_game_id: gameId, p_period: period });
}

export interface MyBest {
  rank: number;
  named: number;
  time_ms: number;
}

export async function getMyBest(gameId: string): Promise<{ all: MyBest | null; week: MyBest | null } | null> {
  return rpc('get_my_best', { p_game_id: gameId });
}

/** Player-facing text for a server rejection reason. */
export function reasonText(reason: string): string {
  switch (reason) {
    case 'username_taken':
      return 'That username is taken. Try another.';
    case 'username_not_allowed':
      return "That username isn't allowed. Try another.";
    case 'invalid_username':
      return 'Use 3 to 20 characters: lowercase letters, digits and underscores.';
    case 'age_not_confirmed':
      return 'Please confirm you are 13 or older.';
    case 'profile_exists':
      return 'You already have a username.';
    case 'rate_limited':
      return 'Too many submissions. Wait a minute and try again.';
    case 'run_already_used':
      return 'This run was already submitted.';
    case 'network':
      return "Couldn't reach the leaderboard. Check your connection and try again.";
    default:
      return "The leaderboard didn't accept this run.";
  }
}
