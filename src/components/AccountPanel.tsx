import { useState, type FormEvent } from 'react';
import { createProfile, reasonText, sendMagicLink } from '../lib/account';
import type { Account } from '../lib/useAccount';
import { cleanUsername, USERNAME_RE } from '../lib/username';

interface Props {
  account: Account;
}

/**
 * Sign in (magic link), pick a username on first sign-in, or sign out.
 * Never shows an email address, not even the player's own.
 */
export function AccountPanel({ account }: Props) {
  const { state } = account;
  switch (state.status) {
    case 'disabled':
      return null;
    case 'loading':
      return <p className="intro">Checking your sign-in…</p>;
    case 'signedOut':
      return <SignIn error={state.error} onSent={account.watch} />;
    case 'needsProfile':
      return <ProfileSetup onDone={account.refresh} onSignOut={account.signOut} />;
    case 'signedIn':
      return (
        <div className="account">
          <h2>Account</h2>
          <p>
            Signed in as <b id="whoami">@{state.username}</b>. Finished runs of Name Them All, Name In Order and
            Reverse Order can go on the leaderboard.
          </p>
          <button type="button" className="btn ghost" id="signOut" onClick={account.signOut}>
            Sign out
          </button>
        </div>
      );
  }
}

function SignIn({ error, onSent }: { error?: string; onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error ? `That sign-in link didn't work (${error}). Ask for a new one.` : '');

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    const r = await sendMagicLink(email.trim());
    setBusy(false);
    if (r.ok) {
      setSent(true);
      setEmail('');
      onSent();
    } else {
      setMessage(r.message);
    }
  }

  if (sent) {
    return (
      <div className="account">
        <h2>Check your email</h2>
        <p aria-live="polite" id="linkSent">
          We sent you a sign-in link. Open it on this device to finish signing in.
        </p>
      </div>
    );
  }

  return (
    <form className="account" onSubmit={(ev) => void submit(ev)}>
      <h2>Sign in</h2>
      <p className="muted">
        Accounts are optional: every game works without one. Signing in lets you put runs on the leaderboard. Your
        email is used only to sign you in and is never shown to anyone.
      </p>
      <label className="field">
        <span>Email</span>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
        />
      </label>
      <button type="submit" className="btn" id="sendLink" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      <p className="fb bad" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

function ProfileSetup({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [username, setUsername] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const valid = USERNAME_RE.test(username);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!valid) return setMessage(reasonText('invalid_username'));
    if (!adult) return setMessage(reasonText('age_not_confirmed'));
    setBusy(true);
    const r = await createProfile(username, adult);
    setBusy(false);
    if (r.ok) onDone();
    else setMessage(reasonText(r.reason));
  }

  return (
    <form className="account" onSubmit={(ev) => void submit(ev)}>
      <h2>Choose a username</h2>
      <p className="muted">
        This is the only thing other players see. Don&rsquo;t use your real name. 3 to 20 characters: lowercase letters,
        digits and underscores.
      </p>
      <label className="field">
        <span>Username</span>
        <input
          id="username"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={20}
          value={username}
          onChange={(ev) => setUsername(cleanUsername(ev.target.value))}
          aria-describedby="usernameHelp"
        />
      </label>
      <p id="usernameHelp" className="hint">
        {username.length > 0 && !valid ? 'At least 3 characters.' : ' '}
      </p>
      <label className="check">
        <input id="age13" type="checkbox" checked={adult} onChange={(ev) => setAdult(ev.target.checked)} />
        <span>I am 13 or older.</span>
      </label>
      <div className="row-actions">
        <button type="submit" className="btn" id="saveProfile" disabled={busy}>
          {busy ? 'Saving…' : 'Save username'}
        </button>
        <button type="button" className="btn ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <p className="fb bad" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
