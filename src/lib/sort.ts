// Pure logic for sort rounds (kind 'sort'). No DOM, no React.

import { ELEMENTS, type Element } from '../data/elements';
import type { SortBucket, SortGame } from '../games/types';
import { shuffle } from './quiz';
import { readJSON, writeJSON } from './storage';

/**
 * Z 104–118 are excluded from family sorting, even under "All 118". Their
 * family placements are predictions from periodic trends, not measured
 * chemistry (only a handful of atoms of each have ever existed), and asking
 * a learner to "know" them teaches false certainty.
 */
export const PREDICTED_FROM_Z = 104;

export const isMeasured = (e: Element): boolean => e.z < PREDICTED_FROM_Z;

/** Elements a sort game may deal for a range. */
export function sortPool(game: SortGame, range: number): Element[] {
  return ELEMENTS.filter((e) => e.z <= range && game.eligible(e));
}

/** Buckets that have at least one element in the pool, in the game's display order. */
export function visibleBuckets(game: SortGame, pool: readonly Element[]): SortBucket[] {
  const used = new Set(pool.map((e) => game.bucketOf(e)));
  return game.buckets.filter((b) => used.has(b.id));
}

export interface SortTile {
  z: number;
  /** The correct bucket id. */
  answer: string;
  placed: boolean;
  /** Judged placements so far (right or wrong). A drop outside every bucket is not one. */
  attempts: number;
}

export interface SortState {
  tiles: SortTile[];
  mistakes: number;
}

export type PlaceOutcome = 'correct' | 'wrong' | 'cancelled' | 'ignored';

export function dealRound(
  game: SortGame,
  pool: readonly Element[],
  count: number,
  random: () => number = Math.random,
): SortState {
  const tiles = shuffle(pool, random)
    .slice(0, count)
    .map((e) => ({ z: e.z, answer: game.bucketOf(e), placed: false, attempts: 0 }));
  return { tiles, mistakes: 0 };
}

/**
 * Judge placing tile `z` in `bucketId`. `null` means it was dropped outside
 * every bucket: it goes back to the tray and is NOT a mistake. A correct
 * tile stays placed; a wrong one returns to the tray and counts a mistake.
 */
export function place(
  state: SortState,
  z: number,
  bucketId: string | null,
): { state: SortState; outcome: PlaceOutcome } {
  const tile = state.tiles.find((t) => t.z === z);
  if (!tile || tile.placed) return { state, outcome: 'ignored' };
  if (bucketId === null) return { state, outcome: 'cancelled' };
  const correct = tile.answer === bucketId;
  const tiles = state.tiles.map((t) =>
    t.z === z ? { ...t, attempts: t.attempts + 1, placed: correct } : t,
  );
  return {
    state: { tiles, mistakes: state.mistakes + (correct ? 0 : 1) },
    outcome: correct ? 'correct' : 'wrong',
  };
}

export const isComplete = (s: SortState): boolean => s.tiles.every((t) => t.placed);

/** Score: tiles placed correctly on their first try. */
export const firstTryScore = (s: SortState): number =>
  s.tiles.filter((t) => t.placed && t.attempts === 1).length;

/** Tiles that needed more than one try, in deal order. */
export const retriedTiles = (s: SortState): SortTile[] => s.tiles.filter((t) => t.attempts > 1);

export const trayTiles = (s: SortState): SortTile[] => s.tiles.filter((t) => !t.placed);

export const placedIn = (s: SortState, bucketId: string): SortTile[] =>
  s.tiles.filter((t) => t.placed && t.answer === bucketId);

// ---- Best results: rank by first-try score, break ties by faster time ----

export interface SortResult {
  score: number;
  /** Whole seconds, as displayed. */
  seconds: number;
}

export function isSortResult(v: unknown): v is SortResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.score === 'number' &&
    Number.isInteger(r.score) &&
    r.score >= 0 &&
    typeof r.seconds === 'number' &&
    Number.isInteger(r.seconds) &&
    r.seconds >= 0
  );
}

/** True when `a` beats `b`: higher score, or the same score in less time. */
export function isBetterSortResult(a: SortResult, b: SortResult | null): boolean {
  if (b === null) return true;
  return a.score > b.score || (a.score === b.score && a.seconds < b.seconds);
}

/**
 * Save `result` if it beats the stored best. `isNew` follows the quiz
 * convention: only true when there was a previous best and it was beaten.
 */
export function recordSortBest(
  key: string,
  result: SortResult,
): { prev: SortResult | null; best: SortResult; isNew: boolean } {
  const prev = readJSON(key, isSortResult);
  const better = isBetterSortResult(result, prev);
  const best = better ? result : (prev ?? result);
  if (better) writeJSON(key, best);
  return { prev, best, isNew: prev !== null && better };
}

export const formatSeconds = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
