import { useState } from 'react';
import { FillRunner } from './components/FillRunner';
import { ModePicker } from './components/ModePicker';
import { QuizRunner } from './components/QuizRunner';
import { gameById, GAMES } from './games';
import { DEFAULT_RANGE, isRangeMax, type RangeMax } from './lib/quiz';
import { keys, readJSON, writeJSON } from './lib/storage';

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

  return (
    <main>
      <h1>Element Drills</h1>
      <p className="lede">Five games for learning the periodic table. Pick one to start.</p>
      <ModePicker games={GAMES} current={gameId} onPick={pick} />
      <section className="stage" id="stage" aria-label={game ? game.title : 'Choose a game'}>
        {!game ? (
          <p className="intro">
            Choose a game above. Quiz games are ten questions each, and you can narrow them to the
            first 20, 36, or 54 elements while you&rsquo;re learning.
          </p>
        ) : game.kind === 'fill' ? (
          <FillRunner key={`${game.id}:${round}`} game={game} onRestart={restart} />
        ) : (
          <QuizRunner
            key={`${game.id}:${range}:${round}`}
            game={game}
            range={range}
            onRangeChange={changeRange}
            onRestart={restart}
          />
        )}
      </section>
    </main>
  );
}
