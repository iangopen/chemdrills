import { findNextInOrder } from '../lib/sequence';
import type { FillTableGame } from './types';

export const reverseOrder: FillTableGame = {
  id: 'reverseOrder',
  title: 'Reverse order',
  code: 'Rev',
  family: 'lanthanide',
  kind: 'fillTable',
  round: { seconds: 15 * 60 },
  order: 'desc',
  ranked: true,
  placeholder: 'Type the next element, from oganesson down',
  check: (pool, input, found) => findNextInOrder(pool, 'desc', input, found),
  score: (found) => found.size,
};
