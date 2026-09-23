import { acceptedNames, type Element } from '../data/elements';

export type MatchResult = 'exact' | 'close' | null;

/** Minimum normalized input length before a 1-letter typo is forgiven. */
export const FUZZY_MIN_LENGTH = 5;

/** Lowercase and strip every non-letter. */
export function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z]/g, '');
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const sub = (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, sub);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/**
 * Quiz-mode name match: exact (any accepted spelling), or 'close' when the
 * input is 5+ letters and one edit away. Callers show the correct spelling
 * on 'close'.
 */
export function matchName(e: Element, input: string): MatchResult {
  const n = normalize(input);
  if (!n) return null;
  const names = acceptedNames(e).map(normalize);
  if (names.includes(n)) return 'exact';
  if (n.length >= FUZZY_MIN_LENGTH && names.some((x) => levenshtein(x, n) <= 1)) return 'close';
  return null;
}

/** Number → element: the symbol is accepted too, case-insensitive. */
export function matchNameOrSymbol(e: Element, input: string): MatchResult {
  if (input.trim().toLowerCase() === e.symbol.toLowerCase()) return 'exact';
  return matchName(e, input);
}

/** Exact match only (plus alternate spellings). Used by Name Them All. */
export function matchNameExact(e: Element, input: string): boolean {
  const n = normalize(input);
  return n !== '' && acceptedNames(e).map(normalize).includes(n);
}

/** Name Them All: the first not-yet-found element whose name is typed exactly. */
export function findExactElement(
  elements: readonly Element[],
  input: string,
  found: ReadonlySet<number>,
): Element | undefined {
  return elements.find((e) => !found.has(e.z) && matchNameExact(e, input));
}

/** Integer answers (Element → number). */
export function matchInteger(expected: number, input: string): MatchResult {
  return Number.parseInt(input, 10) === expected ? 'exact' : null;
}
