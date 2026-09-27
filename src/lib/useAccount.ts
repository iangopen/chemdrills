import { useCallback, useEffect, useState } from 'react';
import { accountsEnabled, authErrorInUrl, getClient, getMyUsername, hasAuthHint, signOut } from './account';

export type AccountState =
  /** No Supabase config in this build: local-only, no accounts UI. */
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  /** Signed in, but no username yet (first sign-in). Can't submit until there is one. */
  | { status: 'needsProfile' }
  | { status: 'signedIn'; username: string };

export interface Account {
  state: AccountState;
  /** Re-read the profile, e.g. after creating a username. */
  refresh: () => void;
  /** Start following the session (after a sign-in email is sent, another tab may complete it). */
  watch: () => void;
  signOut: () => void;
}

/**
 * Tracks the session. Loads supabase-js at startup only when there's a stored
 * session or an auth redirect in the URL; otherwise the player is simply
 * signed out and no request is made.
 */
export function useAccount(): Account {
  const [state, setState] = useState<AccountState>(() =>
    !accountsEnabled ? { status: 'disabled' } : hasAuthHint() ? { status: 'loading' } : { status: 'signedOut' },
  );
  const [watching, setWatching] = useState(() => accountsEnabled && hasAuthHint());

  const resolve = useCallback(async (hasSession: boolean) => {
    if (!hasSession) {
      setState({ status: 'signedOut' });
      return;
    }
    const username = await getMyUsername();
    setState(username ? { status: 'signedIn', username } : { status: 'needsProfile' });
  }, []);

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let unsubscribe = () => {};
    const urlError = authErrorInUrl();
    void getClient().then(async (client) => {
      if (cancelled) return;
      // Don't await inside the callback: supabase-js holds a lock while it runs.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
          if (!cancelled) void resolve(session !== null);
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const { data: current } = await client.auth.getSession();
      if (cancelled) return;
      if (!current.session && urlError) {
        setState({ status: 'signedOut', error: urlError });
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {
          // ignore
        }
        return;
      }
      await resolve(current.session !== null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [watching, resolve]);

  const refresh = useCallback(() => {
    void resolve(true);
  }, [resolve]);

  const watch = useCallback(() => setWatching(true), []);

  const doSignOut = useCallback(() => {
    void signOut().finally(() => setState({ status: 'signedOut' }));
  }, []);

  return { state, refresh, watch, signOut: doSignOut };
}
