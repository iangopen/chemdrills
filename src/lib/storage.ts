// Versioned localStorage helpers. Every access is wrapped in try/catch: the
// app must behave identically when storage is blocked or throws.

const PREFIX = 'eldrills:v1:';

export const keys = {
  best: (gameId: string, range: number) => `best:${gameId}:${range}`,
  bestNameAll: () => 'best:nameAll',
  /** Ordered fill games (Name In Order, Reverse Order): fastest full run, in ms. */
  bestTimeMs: (gameId: string) => `best:${gameId}`,
  range: () => 'range',
} as const;

export function readJSON<T>(key: string, isValid: (v: unknown) => v is T): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: ignore, the app keeps working in memory.
  }
}

export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function readNumber(key: string): number | null {
  return readJSON(key, isNumber);
}

/** Save `score` if it beats the stored best. Returns the previous and new best. */
export function recordBest(key: string, score: number): { prev: number; best: number } {
  const prev = readNumber(key) ?? 0;
  const best = Math.max(prev, score);
  writeJSON(key, best);
  return { prev, best };
}

/** Save `ms` if it beats the stored fastest time. Lower is better; null = no previous time. */
export function recordFastest(key: string, ms: number): { prev: number | null; best: number } {
  const prev = readNumber(key);
  const best = prev === null ? ms : Math.min(prev, ms);
  writeJSON(key, best);
  return { prev, best };
}
