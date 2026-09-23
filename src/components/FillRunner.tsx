import { useEffect, useRef, useState } from 'react';
import { ELEMENTS } from '../data/elements';
import type { FillGame } from '../games/types';
import { keys, recordBest } from '../lib/storage';
import { PeriodicTable } from './PeriodicTable';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
  game: FillGame;
  onRestart: () => void;
}

/** Timed free-typing round; the periodic table fills in as names lock in. */
export function FillRunner({ game, onRestart }: Props) {
  const total = ELEMENTS.length;
  const [value, setValue] = useState('');
  const [found, setFound] = useState<ReadonlySet<number>>(() => new Set());
  const [left, setLeft] = useState(game.round.seconds);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ best: number } | null>(null);

  // Refs mirror state for the interval callback and finish(), which must see
  // current values without being re-created every tick.
  const foundRef = useRef(found);
  const leftRef = useRef(left);
  const overRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);

  const over = result !== null;

  function finish() {
    if (overRef.current) return;
    overRef.current = true;
    setRunning(false);
    const { best } = recordBest(keys.bestNameAll(), game.score(foundRef.current));
    setResult({ best });
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
      if (leftRef.current <= 0) finish();
    }, 1000);
    return () => window.clearInterval(id);
    // finish only touches refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function onInput(next: string) {
    if (overRef.current) return;
    if (!running) setRunning(true);
    const hit = game.check(ELEMENTS, next, foundRef.current);
    if (hit) {
      const nextFound = new Set(foundRef.current).add(hit.z);
      foundRef.current = nextFound;
      setFound(nextFound);
      setValue('');
      if (nextFound.size === total) finish();
    } else {
      setValue(next);
    }
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
            placeholder="Type any element name"
            aria-label="Element name"
            aria-describedby="fillHint"
          />
        </div>
        <div className="stats">
          <span aria-live="polite" aria-atomic="true">
            <b id="count">{found.size}</b> of {total}
          </span>
          <span className="clock" id="clock" role="timer" aria-label={`Time left ${fmt(left)}`}>
            {fmt(left)}
          </span>
        </div>
        {over ? (
          <button ref={againRef} type="button" className="btn ghost" id="giveup" onClick={onRestart}>
            Play again
          </button>
        ) : (
          <button type="button" className="btn ghost" id="giveup" onClick={finish}>
            Give up
          </button>
        )}
      </div>
      <PeriodicTable found={found} revealMissed={over} />
      <p className="hint" id="fillHint" aria-live="polite">
        {result
          ? `You named ${found.size} of ${total} with ${fmt(left)} left. Best: ${result.best}. Missed elements are outlined.`
          : "The clock starts on your first letter. Correct names lock in as soon as they're spelled right."}
      </p>
    </>
  );
}
