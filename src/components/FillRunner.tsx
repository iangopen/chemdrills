import { useEffect, useRef, useState } from 'react';
import { ELEMENTS } from '../data/elements';
import type { FillTableGame } from '../games/types';
import { startRun } from '../lib/account';
import { fmtClock as fmt, fmtMs } from '../lib/format';
import { nextZ, type RunEvent } from '../lib/sequence';
import { keys, readNumber, recordBest, recordFastest } from '../lib/storage';
import type { AccountState } from '../lib/useAccount';
import { PeriodicTable } from './PeriodicTable';
import { RunSubmit } from './RunSubmit';

type EndReason = 'complete' | 'gaveUp' | 'timeout';

interface Result {
  reason: EndReason;
  /** Name Them All: best count. Ordered games: fastest full run in ms (null = none yet). */
  best: number | null;
  /** Ordered games: whether this run set a new best over a previous one. */
  newBest: boolean;
  /** Time of the last accepted entry, ms since the first keystroke. */
  timeMs: number;
  events: RunEvent[];
  /** start_run's answer, when the run began signed in; null otherwise. */
  runId: Promise<string | null> | null;
}

interface Props {
  game: FillTableGame;
  onRestart: () => void;
  account?: AccountState;
  onSignIn?: () => void;
}

/**
 * Timed free-typing round; the periodic table fills in as names lock in.
 * Any order (Name Them All, clock counts down) or strict order (Name In Order,
 * Reverse Order: only the next element is accepted, clock counts up).
 */
export function FillRunner({ game, onRestart, account = { status: 'disabled' }, onSignIn }: Props) {
  const total = ELEMENTS.length;
  const ordered = game.order !== undefined;
  const [value, setValue] = useState('');
  const [found, setFound] = useState<ReadonlySet<number>>(() => new Set());
  const [left, setLeft] = useState(game.round.seconds);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Refs mirror state for the interval callback and finish(), which must see
  // current values without being re-created every tick.
  const foundRef = useRef(found);
  const leftRef = useRef(left);
  const overRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  // The run record for the leaderboard: when the first key was pressed, and each accepted entry.
  const startRef = useRef<number | null>(null);
  const eventsRef = useRef<RunEvent[]>([]);
  const runIdRef = useRef<Promise<string | null> | null>(null);

  const over = result !== null;

  function finish(reason: EndReason) {
    if (overRef.current) return;
    overRef.current = true;
    setRunning(false);
    const events = [...eventsRef.current];
    const timeMs = events.at(-1)?.t ?? 0;
    let best: number | null;
    let newBest = false;
    if (!ordered) {
      best = recordBest(keys.bestNameAll(), game.score(foundRef.current)).best;
    } else if (reason === 'complete') {
      const r = recordFastest(keys.bestTimeMs(game.id), timeMs);
      best = r.best;
      newBest = r.prev !== null && r.best < r.prev;
    } else {
      best = readNumber(keys.bestTimeMs(game.id));
    }
    setResult({ reason, best, newBest, timeMs, events, runId: runIdRef.current });
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (over) againRef.current?.focus();
  }, [over]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      leftRef.current = Math.max(0, leftRef.current - 1);
      setLeft(leftRef.current);
      if (leftRef.current <= 0) finish('timeout');
    }, 1000);
    return () => window.clearInterval(id);
    // finish only touches refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function onInput(next: string) {
    if (overRef.current) return;
    if (!running) setRunning(true);
    if (startRef.current === null) {
      startRef.current = Date.now();
      // Only a run started while signed in can be ranked: the server times it from here.
      if (game.ranked && account.status === 'signedIn') runIdRef.current = startRun(game.id);
    }
    const hit = game.check(ELEMENTS, next, foundRef.current);
    if (hit) {
      eventsRef.current.push({ name: next, t: Date.now() - startRef.current });
      const nextFound = new Set(foundRef.current).add(hit.z);
      foundRef.current = nextFound;
      setFound(nextFound);
      setValue('');
      if (nextFound.size === total) finish('complete');
    } else {
      setValue(next);
    }
  }

  const elapsed = game.round.seconds - left;
  const clock = ordered ? fmt(elapsed) : fmt(left);
  const upcoming = ordered && game.order ? nextZ(game.order, found, total) : undefined;
  const eligible = result !== null && (ordered ? result.reason === 'complete' : found.size > 0);

  function summary(r: Result): string {
    if (!ordered) {
      return `You named ${found.size} of ${total} with ${fmt(left)} left. Best: ${r.best ?? 0}. Missed elements are outlined.`;
    }
    const best = r.best === null ? '' : ` Best: ${fmtMs(r.best)}.`;
    if (r.reason === 'complete') {
      return `You named all ${total} in ${fmtMs(r.timeMs)}.${r.newBest ? ' New best!' : ''}${best}`;
    }
    return `You reached ${found.size} of ${total} in ${fmt(elapsed)}. Only a full run gets a time, so this one is unranked.${best} Missed elements are outlined.`;
  }

  return (
    <>
      <div className="bar">
        <div className="row fill-input">
          <input
            ref={inputRef}
            id="nameIn"
            value={value}
            onChange={(ev) => onInput(ev.target.value)}
            disabled={over}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={game.placeholder ?? 'Type any element name'}
            aria-label="Element name"
            aria-describedby="fillHint"
          />
        </div>
        <div className="stats">
          <span aria-live="polite" aria-atomic="true">
            <b id="count">{found.size}</b> of {total}
          </span>
          {upcoming !== undefined && !over && (
            <span id="next">
              Next: <b>#{upcoming}</b>
            </span>
          )}
          <span
            className="clock"
            id="clock"
            role="timer"
            aria-label={ordered ? `Time ${clock}` : `Time left ${clock}`}
          >
            {clock}
          </span>
        </div>
        {over ? (
          <button ref={againRef} type="button" className="btn ghost" id="giveup" onClick={onRestart}>
            Play again
          </button>
        ) : (
          <button type="button" className="btn ghost" id="giveup" onClick={() => finish('gaveUp')}>
            Give up
          </button>
        )}
      </div>
      <PeriodicTable found={found} revealMissed={over} />
      <p className="hint" id="fillHint" aria-live="polite">
        {result
          ? summary(result)
          : ordered
            ? `The clock starts on your first letter. Only the next element in order is accepted${
                game.order === 'asc' ? ', starting with hydrogen' : ', starting with oganesson'
              }.`
            : "The clock starts on your first letter. Correct names lock in as soon as they're spelled right."}
      </p>
      {result && game.ranked && account.status !== 'disabled' && (
        <RunSubmit
          game={game}
          eligible={eligible}
          events={result.events}
          runId={result.runId}
          account={account}
          onSignIn={onSignIn}
        />
      )}
    </>
  );
}
