import type { GameDefinition } from '../games/types';
import { famStyle } from '../lib/famStyle';

interface Props {
  games: readonly GameDefinition[];
  current: string | null;
  onPick: (id: string) => void;
}

/** One element-cell button per game. */
export function ModePicker({ games, current, onPick }: Props) {
  return (
    <nav className="modes" aria-label="Games">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          className="mode"
          data-game={g.id}
          aria-pressed={current === g.id}
          style={famStyle(g.family)}
          onClick={() => onPick(g.id)}
        >
          <span className="code" aria-hidden="true">
            {g.code}
          </span>
          <span className="lbl">{g.title}</span>
        </button>
      ))}
    </nav>
  );
}
