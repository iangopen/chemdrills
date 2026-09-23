/** Guess the mass: 100 points per question. */
export const MASS_MAX_POINTS = 100;
/** A mass guess scoring under this counts as a miss on the results screen. */
export const MASS_MISS_THRESHOLD = 60;

export function massTolerance(mass: number): number {
  return Math.max(2, 0.08 * mass);
}

export function massPoints(mass: number, guess: number): number {
  if (!Number.isFinite(guess)) return 0;
  return Math.round(MASS_MAX_POINTS * Math.max(0, 1 - Math.abs(guess - mass) / massTolerance(mass)));
}

/** Parse a typed mass guess. Returns NaN for unparseable input (scores 0). */
export function parseGuess(input: string): number {
  return Number.parseFloat(input.replace(',', '.'));
}
