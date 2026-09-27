import { useEffect, useState } from 'react';
import type { FillTableGame } from '../games/types';
import { getLeaderboard, type BoardRow, type Period } from '../lib/account';
import { fmtMs } from '../lib/format';
import { famStyle } from '../lib/famStyle';

interface Props {
  games: readonly FillTableGame[];
}

const PERIODS: readonly { id: Period; label: string }[] = [
  { id: 'all', label: 'All-time' },
  { id: 'week', label: 'This week' },
];

type Load = { key: string; rows: BoardRow[] | null };

/** A tab per ranked game, all-time or this week (from Monday 00:00 UTC), top 50 plus your own row. */
export function Leaderboard({ games }: Props) {
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [period, setPeriod] = useState<Period>('all');
  const [load, setLoad] = useState<Load | null>(null);
  const key = `${gameId}:${period}`;
  const game = games.find((g) => g.id === gameId);

  useEffect(() => {
    let cancelled = false;
    void getLeaderboard(gameId, period).then((rows) => {
      if (!cancelled) setLoad({ key: `${gameId}:${period}`, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, period]);

  const rows = load?.key === key ? load.rows : undefined;
  const top = rows?.filter((r) => r.rank <= 50) ?? [];
  const pinned = rows?.find((r) => r.is_me && r.rank > 50);

  return (
    <div className="board">
      <h2>Leaderboards</h2>
      <div className="board-tabs" role="tablist" aria-label="Ranked games">
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            id={`tab-${g.id}`}
            aria-selected={g.id === gameId}
            aria-controls="boardPanel"
            className="board-tab"
            style={famStyle(g.family)}
            onClick={() => setGameId(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === period} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div id="boardPanel" role="tabpanel" aria-labelledby={`tab-${gameId}`} aria-live="polite" aria-busy={rows === undefined}>
        {rows === undefined ? (
          <p className="hint">Loading…</p>
        ) : rows === null ? (
          <p className="hint">Couldn&rsquo;t load the leaderboard. Check your connection and try again.</p>
        ) : top.length === 0 ? (
          <p className="hint">No runs yet{period === 'week' ? ' this week' : ''}. Be the first.</p>
        ) : (
          <table className="board-table">
            <caption className="sr-only">
              {game?.title}, {period === 'all' ? 'all-time' : 'this week'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                {!game?.order && <th scope="col">Named</th>}
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <Row key={r.rank} row={r} showNamed={!game?.order} />
              ))}
              {pinned && (
                <>
                  <tr className="board-gap" aria-hidden="true">
                    <td colSpan={game?.order ? 3 : 4}>⋯</td>
                  </tr>
                  <Row row={pinned} showNamed={!game?.order} />
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="hint">
        Each player&rsquo;s best run. Ties go to whoever got there first. Weeks start Monday 00:00 UTC.
      </p>
    </div>
  );
}

function Row({ row, showNamed }: { row: BoardRow; showNamed: boolean }) {
  return (
    <tr className={row.is_me ? 'me' : undefined} data-rank={row.rank}>
      <td>{row.rank}</td>
      <td>
        @{row.username}
        {row.is_me && <span className="sr-only"> (you)</span>}
      </td>
      {showNamed && <td>{row.named}</td>}
      <td>{fmtMs(row.time_ms)}</td>
    </tr>
  );
}
