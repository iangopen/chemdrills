import type { Element } from '../data/elements';
import type { Answer } from '../games/types';

export const QUESTIONS_PER_ROUND = 10;

export const RANGES = [
  { max: 20, label: '1–20' },
  { max: 36, label: '1–36' },
  { max: 54, label: '1–54' },
  { max: 118, label: 'All 118' },
] as const;

export type RangeMax = (typeof RANGES)[number]['max'];
export const DEFAULT_RANGE: RangeMax = 36;

export function isRangeMax(v: unknown): v is RangeMax {
  return RANGES.some((r) => r.max === v);
}

export function rangeLabel(max: RangeMax): string {
  return RANGES.find((r) => r.max === max)?.label ?? String(max);
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/** Default question generator: distinct random elements from the pool. */
export function randomQuestions(pool: readonly Element[], count: number): Element[] {
  return shuffle(pool).slice(0, count);
}

/** Default scorer for right/wrong quizzes: 1 point per correct answer. */
export const oneIfCorrect = (_e: Element, a: Answer): number => (a.match ? 1 : 0);

export const missIfZero = (points: number): boolean => points === 0;

/** Feedback wording shared by the right/wrong quizzes (from the prototype). */
export function identityFeedback(e: Element, _input: string, a: Answer): string {
  if (a.match === 'close') return `Correct, spelled ${e.name}.`;
  if (a.match === 'exact') return `Correct: ${e.name}, ${e.symbol}, number ${e.z}.`;
  return `It's ${e.name} (${e.symbol}), atomic number ${e.z}.`;
}
