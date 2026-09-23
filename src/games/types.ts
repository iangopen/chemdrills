import type { Element, Family } from '../data/elements';
import type { MatchResult } from '../lib/matching';

/** Which tile fields a prompt shows. A field set to false is hidden ("?"). */
export interface TileMask {
  num?: boolean;
  sym?: boolean;
  name?: boolean;
  mass?: boolean;
}

/** What the checker extracted from the player's input. */
export interface Answer {
  match: MatchResult;
  /** Numeric guess, for games scored by closeness (Guess the mass). */
  guess?: number;
}

interface GameBase {
  /** Stable id. Used in storage keys, so never rename a shipped id. */
  id: string;
  title: string;
  /** Big text on the picker tile, like an element symbol. */
  code: string;
  /** Family color of the picker tile. */
  family: Family;
}

/**
 * A 10-question round played through QuizRunner: show a tile with some
 * fields hidden, take one typed answer, reveal the whole tile.
 */
export interface QuizGame extends GameBase {
  kind: 'quiz';
  round: {
    questions: number;
    /** Points available per question; the results screen shows score of questions x this. */
    maxPerQuestion: number;
    showStreak: boolean;
  };
  prompt: {
    question: string;
    placeholder: string;
    inputMode: 'text' | 'decimal';
    hide: TileMask;
    hint?: string;
  };
  /** Pick this round's elements from the selected range. */
  makeQuestions(pool: readonly Element[], count: number): Element[];
  /** Answer checker. */
  check(e: Element, input: string): Answer;
  /** Scorer: points earned for one answer. */
  score(e: Element, answer: Answer): number;
  /** Whether this answer counts as a miss (breaks the streak, shown on results). */
  isMiss(points: number): boolean;
  /** Feedback line shown (and announced) after answering. */
  feedback(e: Element, input: string, answer: Answer, points: number): string;
  /** Heading above the missed tiles on the results screen. */
  missedLabel: string;
}

/**
 * A timed round played through FillRunner: type names freely and the
 * periodic table fills in.
 */
export interface FillGame extends GameBase {
  kind: 'fill';
  round: { seconds: number };
  /** Answer checker: the element the current input completes, if any. */
  check(pool: readonly Element[], input: string, found: ReadonlySet<number>): Element | undefined;
  /** Scorer: final score for a finished round. */
  score(found: ReadonlySet<number>): number;
}

/**
 * Every game implements this. `kind` selects the shared runner that
 * plays it. Adding a game that fits an existing runner = one module in
 * src/games/ plus one line in src/games/index.ts.
 */
export type GameDefinition = QuizGame | FillGame;
