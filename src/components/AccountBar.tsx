import type { AccountState } from '../lib/useAccount';

export type View = 'play' | 'leaderboard' | 'account';

interface Props {
  state: AccountState;
  view: View;
  onView: (v: View) => void;
}

/** Leaderboards and sign-in. Sits after the game picker in DOM order: the picker stays the first Tab stop. */
export function AccountBar({ state, view, onView }: Props) {
  if (state.status === 'disabled') return null;
  const who =
    state.status === 'signedIn'
      ? `@${state.username}`
      : state.status === 'needsProfile'
        ? 'Choose a username'
        : state.status === 'loading'
          ? 'Account'
          : 'Sign in';
  return (
    <nav className="account-bar" aria-label="Account">
      <button
        type="button"
        className="btn ghost"
        id="openBoard"
        aria-pressed={view === 'leaderboard'}
        onClick={() => onView('leaderboard')}
      >
        Leaderboards
      </button>
      <button
        type="button"
        className="btn ghost"
        id="openAccount"
        aria-pressed={view === 'account'}
        onClick={() => onView('account')}
      >
        {who}
      </button>
    </nav>
  );
}
