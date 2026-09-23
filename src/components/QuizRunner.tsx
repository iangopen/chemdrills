import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ELEMENTS, type Element } from '../data/elements';
import type { QuizGame } from '../games/types';
import { rangeLabel, type RangeMax } from '../lib/quiz';
import { keys, recordBest } from '../lib/storage';
import { ElementTile } from './ElementTile';
import { RangePicker } from './RangePicker';

interface Props {
  game: QuizGame;
  range: RangeMax;
  onRangeChange: (max: RangeMax) => void;
  onRestart: () => void;
}

interface Answered {
  points: number;
  miss: boolean;
  feedback: string;
}

/** Plays any QuizGame: N questions, one typed answer each, then results. */
export function QuizRunner({ game, range, onRangeChange, onRestart }: Props) {
  const { questions, maxPerQuestion, showStreak } = game.round;
  const [deck] = useState<Element[]>(() =>
    game.makeQuestions(
      ELEMENTS.filter((e) => e.z <= range),
      questions,
    ),
  );
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [missed, setMissed] = useState<Element[]>([]);
  const [results, setResults] = useState<{ prev: number; best: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);

  // Focus follows the flow: input for a new question, the Next button once
  // answered (so Enter again advances), Play again on the results screen.
  useEffect(() => {
    if (results) againRef.current?.focus();
    else if (answered) goRef.current?.focus();
    else inputRef.current?.focus();
  }, [i, answered, results]);

  const e = deck[i];
  const max = questions * maxPerQuestion;

  function submit() {
    if (!e || answered || !value.trim()) return;
    const answer = game.check(e, value);
    const points = game.score(e, answer);
    const miss = game.isMiss(points);
    setScore((s) => s + points);
    setStreak((s) => (miss ? 0 : s + 1));
    if (miss) setMissed((m) => [...m, e]);
    setAnswered({ points, miss, feedback: game.feedback(e, value, answer, points) });
  }

  function next() {
    if (i + 1 < deck.length) {
      setI(i + 1);
      setValue('');
      setAnswered(null);
    } else {
      setResults(recordBest(keys.best(game.id, range), score));
    }
  }

  const act = () => (answered ? next() : submit());
  const onKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      act();
    }
  };

  if (results) {
    const label = rangeLabel(range);
    return (
      <>
        <div className="bar">
          <RangePicker value={range} onChange={onRangeChange} />
        </div>
        <div className="result" id="results">
          <p className="big" id="finalScore">
            {score} of {max}
          </p>
          <p className="hint">
            {score > results.prev && results.prev > 0 ? 'New best' : 'Best'} for elements {label}:{' '}
            {results.best}
          </p>
          {missed.length ? (
            <>
              <p className="misses-label">{game.missedLabel}:</p>
              <ul className="misses" aria-label={game.missedLabel}>
                {missed.map((m) => (
                  <li key={m.z}>
                    <ElementTile element={m} size="sm" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No misses. Try a wider range.</p>
          )}
          <button ref={againRef} type="button" className="btn" id="again" onClick={onRestart}>
            Play again
          </button>
        </div>
      </>
    );
  }

  if (!e) return null;

  return (
    <>
      <div className="bar">
        <RangePicker value={range} onChange={onRangeChange} />
        <div className="stats" id="stats">
          <span>
            Question <b id="qnum">{i + 1}</b> of {questions}
          </span>
          <span>
            Score <b id="score">{score}</b>
          </span>
          {showStreak && (
            <span>
              Streak <b id="streak">{streak}</b>
            </span>
          )}
        </div>
      </div>
      <div className="prompt">
        <div id="tileSlot">
          <ElementTile element={e} hide={answered ? undefined : game.prompt.hide} />
        </div>
        <div className="ask">
          <p className="q" id="question">
            {game.prompt.question}
          </p>
          <div className="row">
            <input
              ref={inputRef}
              id="ans"
              value={value}
              onChange={(ev) => setValue(ev.target.value)}
              onKeyDown={onKeyDown}
              readOnly={answered !== null}
              inputMode={game.prompt.inputMode}
              enterKeyHint={answered ? 'next' : 'done'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={game.prompt.placeholder}
              aria-label={game.prompt.placeholder}
              aria-describedby="question"
            />
            <button ref={goRef} type="button" className="btn" id="go" onClick={act}>
              {answered ? (i + 1 < deck.length ? 'Next' : 'See results') : 'Check'}
            </button>
          </div>
          <p
            className={answered ? `fb ${answered.miss ? 'bad' : 'good'}` : 'fb'}
            id="fb"
            aria-live="polite"
            aria-atomic="true"
          >
            {answered?.feedback ?? ''}
          </p>
          {game.prompt.hint && <p className="hint">{game.prompt.hint}</p>}
        </div>
      </div>
    </>
  );
}
