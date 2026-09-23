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
 * A timed round played through FillRunner (kind 'fillTable'): type names freely and the
 * periodic table fills in.
 */
export interface FillTableGame extends GameBase {
  kind: 'fillTable';
  round: { seconds: number };
  /** Answer checker: the element the current input completes, if any. */
  check(pool: readonly Element[], input: string, found: ReadonlySet<number>): Element | undefined;
  /** Scorer: final score for a finished round. */
  score(found: ReadonlySet<number>): number;
}

/** A drop target in a sort round. */
export interface SortBucket {
  id: string;
  label: string;
  /** Swatch color, and the color a tile takes on once placed here. */
  color: Family;
}

/**
 * A sort round played through SortRunner: deal element tiles into a tray in
 * a neutral color (the tile must not give away the answer), and the player
 * places each one in a bucket. Placement is judged immediately.
 */
export interface SortGame extends GameBase {
  kind: 'sort';
  round: { tiles: number };
  prompt: { instruction: string };
  /** Which elements may be dealt at all (applied on top of the range). */
  eligible(e: Element): boolean;
  /** Every possible bucket, in display order. Buckets with no eligible element in range are hidden. */
  buckets: readonly SortBucket[];
  /** Id of the bucket this element belongs in. */
  bucketOf(e: Element): string;
  /** Heading above the tiles that needed more than one try. */
  retryLabel: string;
}

/**
 * Every game implements this, discriminated on `kind`. Each kind has its own
 * config shape and its own screen: App.tsx switches on `kind` exhaustively,
 * so a new kind without a screen does not compile. Adding a game of an
 * existing kind = one module in src/games/ plus one line in src/games/index.ts.
 */
export type GameDefinition = QuizGame | FillTableGame | SortGame;
