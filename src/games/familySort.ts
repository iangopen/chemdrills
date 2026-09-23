import { FAMILIES } from '../data/elements';
import { isMeasured } from '../lib/sort';
import type { SortGame } from './types';

export const familySort: SortGame = {
  id: 'familySort',
  title: 'Family sort',
  code: 'Fa',
  family: 'alkali',
  kind: 'sort',
  round: { tiles: 12 },
  prompt: {
    instruction: 'Put each element in its family. Drag a tile, or select it and then a family.',
  },
  // Z 104+ have predicted, not measured, families: never dealt (see PREDICTED_FROM_Z).
  eligible: isMeasured,
  // FAMILIES order: across the table left to right, then the f-block.
  buckets: FAMILIES.map((f) => ({ id: f.id, label: f.label, color: f.id })),
  bucketOf: (e) => e.family,
  retryLabel: 'Needed another try',
};
