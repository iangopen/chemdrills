import { useState } from 'react';
import { FillRunner } from './components/FillRunner';
import { ModePicker } from './components/ModePicker';
import { QuizRunner } from './components/QuizRunner';
import { SortRunner } from './components/SortRunner';
import { gameById, GAMES } from './games';
import type { GameDefinition } from './games/types';
import { DEFAULT_RANGE, isRangeMax, type RangeMax } from './lib/quiz';
import { keys, readJSON, writeJSON } from './lib/storage';

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  // Bumped to remount the runner: picking a game, Play again, or a range change.
  const [round, setRound] = useState(0);
  const [range, setRange] = useState<RangeMax>(() => readJSON(keys.range(), isRangeMax) ?? DEFAULT_RANGE);

  const game = gameId ? gameById(gameId) : undefined;
  const restart = () => setRound((r) => r + 1);

  function pick(id: string) {
    setGameId(id);
    restart();
  }

  function changeRange(max: RangeMax) {
    setRange(max);
    writeJSON(keys.range(), max);
    restart();
  }

  /** One screen per kind. Exhaustive: a new kind without a screen fails to compile. */
  function screen(g: GameDefinition) {
    switch (g.kind) {
      case 'fillTable':
        return <FillRunner key={`${g.id}:${round}`} game={g} onRestart={restart} />;
      case 'quiz':
        return (
          <QuizRunner
            key={`${g.id}:${range}:${round}`}
            game={g}
            range={range}
            onRangeChange={changeRange}
            onRestart={restart}
          />
        );
      case 'sort':
        return (
          <SortRunner
            key={`${g.id}:${range}:${round}`}
            game={g}
            range={range}
            onRangeChange={changeRange}
            onRestart={restart}
          />
        );
      default: {
        const unhandled: never = g;
        return unhandled;
      }
    }
  }

  const count = COUNT_WORDS[GAMES.length] ?? String(GAMES.length);

  return (
    <main>
      <h1>Element Drills</h1>
      <p className="lede">{count} games for learning the periodic table. Pick one to start.</p>
      <ModePicker games={GAMES} current={gameId} onPick={pick} />
      <section className="stage" id="stage" aria-label={game ? game.title : 'Choose a game'}>
        {!game ? (
          <p className="intro">
            Choose a game above. Quiz games are ten questions each, and you can narrow them to the
            first 20, 36, or 54 elements while you&rsquo;re learning.
          </p>
        ) : (
          screen(game)
        )}
      </section>
    </main>
  );
}
