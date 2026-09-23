import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { elementByZ } from '../data/elements';
import type { SortBucket, SortGame } from '../games/types';
import { famStyle } from '../lib/famStyle';
import { rangeLabel, type RangeMax } from '../lib/quiz';
import {
  dealRound,
  firstTryScore,
  formatSeconds,
  isComplete,
  place,
  placedIn,
  recordSortBest,
  retriedTiles,
  sortPool,
  trayTiles,
  visibleBuckets,
  type SortResult,
  type SortState,
} from '../lib/sort';
import { keys } from '../lib/storage';
import { useBucketDrag } from '../lib/useBucketDrag';
import { ElementTile } from './ElementTile';
import { RangePicker } from './RangePicker';

interface Props {
  game: SortGame;
  range: RangeMax;
  onRangeChange: (max: RangeMax) => void;
  onRestart: () => void;
}

interface Finished {
  result: SortResult;
  best: SortResult;
  isNew: boolean;
}

/** Wall clock for the round timer. Only ever read from event handlers and timers, never during render. */
const now = () => Date.now();

/** How long a wrong tile shows its shake / wrong outline. */
const WRONG_MS = 600;

/** Plays any SortGame: place every dealt tile in its bucket. */
export function SortRunner({ game, range, onRangeChange, onRestart }: Props) {
  const pool = useMemo(() => sortPool(game, range), [game, range]);
  const buckets = useMemo(() => visibleBuckets(game, pool), [game, pool]);
  const bucketById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);

  const [state, setState] = useState<SortState>(() => dealRound(game, pool, game.round.tiles));
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [wrong, setWrong] = useState<{ z: number; n: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);

  // Refs for the native drag callbacks, which must see current values.
  const stateRef = useRef(state);
  const startedAt = useRef<number | null>(null);
  const tileEls = useRef(new Map<number, HTMLButtonElement>());
  const againRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<number | 'first' | null>('first');

  const total = state.tiles.length;
  const placedCount = total - trayTiles(state).length;

  function ensureStarted() {
    if (startedAt.current !== null) return;
    startedAt.current = now();
    setRunning(true);
  }

  const secondsSinceStart = () =>
    startedAt.current === null ? 0 : Math.floor((now() - startedAt.current) / 1000);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(secondsSinceStart()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!wrong) return;
    const id = window.setTimeout(() => setWrong(null), WRONG_MS);
    return () => window.clearTimeout(id);
  }, [wrong]);

  // Keyboard flow: after a placement, focus moves to a sensible tray tile.
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const tray = trayTiles(state);
    const z = target === 'first' || !tray.some((t) => t.z === target) ? tray[0]?.z : target;
    if (z !== undefined) tileEls.current.get(z)?.focus({ preventScroll: true });
  }, [state]);

  useEffect(() => {
    if (finished) againRef.current?.focus();
  }, [finished]);

  function judge(z: number, bucketId: string | null) {
    ensureStarted();
    const e = elementByZ(z);
    const { state: next, outcome } = place(stateRef.current, z, bucketId);
    if (outcome === 'ignored') return;
    const bucket = bucketId ? bucketById.get(bucketId) : undefined;
    if (outcome === 'cancelled') {
      setMessage(`${e.name} is back in the tray.`);
      return;
    }
    stateRef.current = next;
    setState(next);
    setSelected(null);
    if (outcome === 'wrong') {
      setWrong((w) => ({ z, n: (w?.n ?? 0) + 1 }));
      setMessage(`${e.name} doesn't go in ${bucket?.label ?? bucketId}. Try again.`);
      focusAfter.current = z;
      return;
    }
    setMessage(`${e.name} placed in ${bucket?.label ?? bucketId}.`);
    focusAfter.current = 'first';
    if (isComplete(next)) {
      const result = { score: firstTryScore(next), seconds: secondsSinceStart() };
      setRunning(false);
      setElapsed(result.seconds);
      const { best, isNew } = recordSortBest(keys.best(game.id, range), result);
      setFinished({ result, best, isNew });
    }
  }

  const { onTouchStart, onMouseDown, shouldIgnoreClick, draggingZ, hoverBucket, setPreviewEl } = useBucketDrag({
    onDrop: judge,
    onTap: (z) => toggleSelect(z),
    onDragStart: () => {
      ensureStarted();
      setSelected(null);
    },
  });

  function toggleSelect(z: number) {
    ensureStarted();
    setSelected((cur) => (cur === z ? null : z));
    const e = elementByZ(z);
    setMessage(selected === z ? '' : `${e.name} selected. Now choose a family.`);
  }

  function onTileClick(z: number, ev: MouseEvent) {
    if (shouldIgnoreClick(ev)) return;
    toggleSelect(z);
  }

  function onBucketClick(b: SortBucket, ev: MouseEvent) {
    if (shouldIgnoreClick(ev)) return;
    if (selected === null) {
      setMessage('Select a tile first, then a family.');
      return;
    }
    judge(selected, b.id);
  }

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && selected !== null) {
      setSelected(null);
      setMessage('');
    }
  }

  if (finished) {
    const { result, best, isNew } = finished;
    const retried = retriedTiles(state);
    return (
      <>
        <div className="bar">
          <RangePicker value={range} onChange={onRangeChange} />
        </div>
        <div className="result" id="results">
          <p className="big" id="finalScore">
            {result.score} of {total}
          </p>
          <p className="sort-time" id="finalTime">
            Time <b>{formatSeconds(result.seconds)}</b>
          </p>
          <p className="hint" id="bestLine">
            {isNew ? 'New best' : 'Best'} for elements {rangeLabel(range)}: {best.score} in{' '}
            {formatSeconds(best.seconds)}
          </p>
          {retried.length ? (
            <>
              <p className="misses-label">{game.retryLabel}:</p>
              <ul className="misses retried" aria-label={game.retryLabel}>
                {retried.map((t) => {
                  const b = bucketById.get(t.answer);
                  return (
                    <li key={t.z} className="retried-item" data-z={t.z}>
                      <ElementTile element={elementByZ(t.z)} size="sm" color={b?.color} />
                      <span className="retried-family">{b?.label ?? t.answer}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>Every tile right on the first try.</p>
          )}
          <button ref={againRef} type="button" className="btn" id="again" onClick={onRestart}>
            Play again
          </button>
        </div>
      </>
    );
  }

  const tray = trayTiles(state);
  const dragged = draggingZ !== null ? elementByZ(draggingZ) : null;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="bar">
        <RangePicker value={range} onChange={onRangeChange} />
        <div className="stats" id="stats">
          <span>
            Placed <b id="placed">{placedCount}</b> of {total}
          </span>
          <span>
            Mistakes <b id="mistakes">{state.mistakes}</b>
          </span>
          <span className="clock sort-clock" id="clock" role="timer" aria-label={`Time ${formatSeconds(elapsed)}`}>
            {formatSeconds(elapsed)}
          </span>
        </div>
      </div>
      <p className="hint sort-instruction" id="sortInstruction">
        {game.prompt.instruction}
      </p>

      <ul className="tray" id="tray" aria-label="Tiles to sort" aria-describedby="sortInstruction">
        {tray.map((t) => {
          const e = elementByZ(t.z);
          const isWrong = wrong?.z === t.z;
          const cls = [
            'tray-tile',
            selected === t.z && 'selected',
            draggingZ === t.z && 'dragging',
            isWrong && 'wrong',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={isWrong ? `${t.z}:${wrong.n}` : t.z}>
              <button
                ref={(el) => {
                  if (el) tileEls.current.set(t.z, el);
                  else tileEls.current.delete(t.z);
                }}
                type="button"
                className={cls}
                data-tray-z={t.z}
                aria-pressed={selected === t.z}
                aria-label={`${e.name}, ${e.symbol}, atomic number ${e.z}`}
                onClick={(ev) => onTileClick(t.z, ev)}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
              >
                <ElementTile element={e} size="sm" tone="neutral" decorative />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="buckets" id="buckets" role="group" aria-label="Families">
        {buckets.map((b) => {
          const inside = placedIn(state, b.id);
          const cls = ['bucket', hoverBucket === b.id && 'hover', selected !== null && 'armed']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={b.id}
              type="button"
              className={cls}
              data-bucket={b.id}
              style={famStyle(b.color)}
              aria-label={`${b.label}, ${inside.length} placed`}
              onClick={(ev) => onBucketClick(b, ev)}
            >
              <span className="b-head">
                <span className="swatch" aria-hidden="true" />
                <span className="b-label">{b.label}</span>
              </span>
              <span className="b-tiles" aria-hidden="true">
                {inside.map((t) => (
                  <ElementTile key={t.z} element={elementByZ(t.z)} size="xs" color={b.color} decorative />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <p className="fb sort-msg" id="sortMsg" aria-live="polite" aria-atomic="true">
        {message}
      </p>

      {dragged && (
        <div className="drag-preview" ref={setPreviewEl} aria-hidden="true">
          <ElementTile element={dragged} size="sm" tone="neutral" decorative />
        </div>
      )}
    </div>
  );
}
