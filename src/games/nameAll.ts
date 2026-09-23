import { findExactElement } from '../lib/matching';
import type { FillGame } from './types';

export const nameAll: FillGame = {
  id: 'nameAll',
  title: 'Name them all',
  code: 'All',
  family: 'noble',
  kind: 'fill',
  round: { seconds: 12 * 60 },
  // Exact matches only: fuzzy matching would lock in a neighbouring element.
  check: (pool, input, found) => findExactElement(pool, input, found),
  score: (found) => found.size,
};
