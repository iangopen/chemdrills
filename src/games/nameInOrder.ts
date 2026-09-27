import { findNextInOrder } from '../lib/sequence';
import type { FillTableGame } from './types';

export const nameInOrder: FillTableGame = {
  id: 'nameInOrder',
  title: 'Name in order',
  code: 'Ord',
  family: 'post',
  kind: 'fillTable',
  round: { seconds: 15 * 60 },
  order: 'asc',
  ranked: true,
  placeholder: 'Type the next element, from hydrogen up',
  check: (pool, input, found) => findNextInOrder(pool, 'asc', input, found),
  score: (found) => found.size,
};
