import { useEffect, useState } from 'react';
import type { FillTableGame } from '../games/types';
import { getMyBest, reasonText, submitRun, type MyBest } from '../lib/account';
import { fmtMs } from '../lib/format';
import type { RunEvent } from '../lib/sequence';
import type { AccountState } from '../lib/useAccount';

interface Props {
  game: FillTableGame;
  /** Whether this run can be ranked at all (ordered games: only a full run). */
  eligible: boolean;
  events: readonly RunEvent[];
  runId: Promise<string | null> | null;
  account: AccountState;
  onSignIn?: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; rankAll: number | null; rankWeek: number | null }
  | { kind: 'error'; message: string };

const describeBest = (game: FillTableGame, b: MyBest) =>
  game.order ? fmtMs(b.time_ms) : `${b.named} named in ${fmtMs(b.time_ms)}`;

/** The results-screen leaderboard block: sign-in prompt, submit button, and rank. */
export function RunSubmit({ game, eligible, events, runId, account, onSignIn }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [myBest, setMyBest] = useState<MyBest | null>(null);
  const signedIn = account.status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void getMyBest(game.id).then((b) => {
      if (!cancelled) setMyBest(b?.all ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, game.id, status.kind]);

  async function submit() {
    setStatus({ kind: 'sending' });
    const id = runId ? await runId : null;
    if (!id) {
      setStatus({ kind: 'error', message: "Couldn't reach the leaderboard when this run started, so it can't be ranked." });
      return;
    }
    const r = await submitRun(game.id, id, events);
    setStatus(
      r.ok
        ? { kind: 'done', rankAll: r.rank_all, rankWeek: r.rank_week }
        : { kind: 'error', message: reasonText(r.reason) },
    );
  }

  if (!signedIn) {
    if (!eligible) return null;
    return (
      <div className="submit-box" id="rankBox">
        <p>Runs you start while signed in can go on the leaderboard.</p>
        <button type="button" className="btn ghost" id="signInToSubmit" onClick={onSignIn}>
          {account.status === 'needsProfile' ? 'Choose a username to submit' : 'Sign in to submit'}
        </button>
      </div>
    );
  }

  return (
    <div className="submit-box" id="rankBox">
      {myBest && (
        <p id="myRank">
          Your leaderboard best: {describeBest(game, myBest)}, rank <b>#{myBest.rank}</b> all-time.
        </p>
      )}
      {eligible && !runId && <p>This run started before you signed in, so it can&rsquo;t be ranked.</p>}
      {eligible && runId && status.kind !== 'done' && (
        <button
          type="button"
          className="btn"
          id="submitRun"
          disabled={status.kind === 'sending'}
          onClick={() => void submit()}
        >
          {status.kind === 'sending' ? 'Submitting…' : 'Submit to leaderboard'}
        </button>
      )}
      <p className="submit-status" aria-live="polite">
        {status.kind === 'done' &&
          `Submitted. Your rank: #${status.rankAll ?? '–'} all-time, #${status.rankWeek ?? '–'} this week.`}
        {status.kind === 'error' && status.message}
      </p>
    </div>
  );
}
