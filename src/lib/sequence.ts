// Pure logic for the ordered fill games (Name In Order, Reverse Order) and
// the run record every ranked game submits to the leaderboard.

import type { Element } from '../data/elements';
import { matchNameExact } from './matching';

export type Order = 'asc' | 'desc';

/** One accepted entry: the text that locked in, and ms since the first keystroke. */
export interface RunEvent {
  name: string;
  t: number;
}

/** The element number that must come next, or undefined once the sequence is complete. */
export function nextZ(order: Order, found: ReadonlySet<number>, total: number): number | undefined {
  if (order === 'asc') {
    for (let z = 1; z <= total; z++) if (!found.has(z)) return z;
  } else {
    for (let z = total; z >= 1; z--) if (!found.has(z)) return z;
  }
  return undefined;
}

/**
 * Ordered-game checker: the input counts only if it exactly names the next
 * element in sequence (alternate spellings included). Anything else, including
 * a correct name out of order, is not a match.
 */
export function findNextInOrder(
  elements: readonly Element[],
  order: Order,
  input: string,
  found: ReadonlySet<number>,
): Element | undefined {
  const z = nextZ(order, found, elements.length);
  const e = z === undefined ? undefined : elements.find((x) => x.z === z);
  return e && matchNameExact(e, input) ? e : undefined;
}
