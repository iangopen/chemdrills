import { afterEach, describe, expect, it, vi } from 'vitest';
import { elementByZ } from '../data/elements';
import { familySort } from '../games/familySort';
import {
  dealRound,
  firstTryScore,
  isBetterSortResult,
  isComplete,
  place,
  PREDICTED_FROM_Z,
  recordSortBest,
  retriedTiles,
  sortPool,
  trayTiles,
  visibleBuckets,
  type SortState,
} from './sort';

/** Deterministic PRNG (mulberry32) so rounds are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bucketIds = (range: number) => visibleBuckets(familySort, sortPool(familySort, range)).map((b) => b.id);

describe('sort pool and buckets', () => {
  it('never includes Z 104+, even under all 118', () => {
    const pool = sortPool(familySort, 118);
    expect(pool).toHaveLength(PREDICTED_FROM_Z - 1);
    expect(Math.max(...pool.map((e) => e.z))).toBe(103);
  });

  it('keeps H as a nonmetal and Po/At in their data-file families', () => {
    const pool = sortPool(familySort, 118);
    expect(pool.find((e) => e.z === 1)?.family).toBe('nonmetal');
    expect(pool.find((e) => e.z === 84)?.family).toBe('post');
    expect(pool.find((e) => e.z === 85)?.family).toBe('halogen');
  });

  it('shows only families present in the range, in periodic-table order', () => {
    expect(bucketIds(20)).toEqual(['alkali', 'alkaline', 'post', 'metalloid', 'nonmetal', 'halogen', 'noble']);
    expect(bucketIds(36)).toEqual([
      'alkali', 'alkaline', 'transition', 'post', 'metalloid', 'nonmetal', 'halogen', 'noble',
    ]);
    expect(bucketIds(54)).toEqual(bucketIds(36));
    expect(bucketIds(118)).toEqual([
      'alkali', 'alkaline', 'transition', 'post', 'metalloid', 'nonmetal', 'halogen', 'noble',
      'lanthanide', 'actinide',
    ]);
  });
});

describe('dealRound', () => {
  it('deals 12 distinct in-range tiles whose answers are visible buckets', () => {
    for (const range of [20, 36, 54, 118]) {
      const pool = sortPool(familySort, range);
      const buckets = new Set(bucketIds(range));
      for (let seed = 1; seed <= 200; seed++) {
        const { tiles, mistakes } = dealRound(familySort, pool, 12, seeded(seed));
        expect(tiles).toHaveLength(12);
        expect(new Set(tiles.map((t) => t.z)).size).toBe(12);
        expect(mistakes).toBe(0);
        for (const t of tiles) {
          expect(t.z).toBeLessThanOrEqual(Math.min(range, 103));
          expect(buckets.has(t.answer)).toBe(true);
          expect(t).toMatchObject({ placed: false, attempts: 0, answer: elementByZ(t.z).family });
        }
      }
    }
  });
});

function roundOf(...zs: number[]): SortState {
  return {
    tiles: zs.map((z) => ({ z, answer: elementByZ(z).family, placed: false, attempts: 0 })),
    mistakes: 0,
  };
}

describe('place', () => {
  it('judges placement immediately', () => {
    const s0 = roundOf(8, 11);
    const right = place(s0, 8, 'nonmetal');
    expect(right.outcome).toBe('correct');
    expect(right.state.tiles[0]).toMatchObject({ placed: true, attempts: 1 });
    expect(right.state.mistakes).toBe(0);

    const wrong = place(s0, 11, 'halogen');
    expect(wrong.outcome).toBe('wrong');
    expect(wrong.state.tiles[1]).toMatchObject({ placed: false, attempts: 1 });
    expect(wrong.state.mistakes).toBe(1);
    expect(trayTiles(wrong.state).map((t) => t.z)).toEqual([8, 11]);
  });

  it('a drop outside every bucket returns the tile and is not a mistake', () => {
    const s0 = roundOf(8);
    const r = place(s0, 8, null);
    expect(r.outcome).toBe('cancelled');
    expect(r.state).toBe(s0);
    expect(r.state.mistakes).toBe(0);
    expect(r.state.tiles[0]?.attempts).toBe(0);
  });

  it('ignores placed or unknown tiles', () => {
    const s1 = place(roundOf(8), 8, 'nonmetal').state;
    expect(place(s1, 8, 'halogen')).toEqual({ state: s1, outcome: 'ignored' });
    expect(place(s1, 99, 'halogen')).toEqual({ state: s1, outcome: 'ignored' });
  });

  it('scores first tries only, counts every mistake, lists retried tiles', () => {
    let s = roundOf(1, 2, 3);
    s = place(s, 1, 'nonmetal').state; // first try
    s = place(s, 2, 'alkali').state; // wrong
    s = place(s, 2, 'halogen').state; // wrong again
    s = place(s, 2, null).state; // dropped outside: not a mistake
    s = place(s, 2, 'noble').state; // right on the 3rd judged try
    expect(isComplete(s)).toBe(false);
    s = place(s, 3, 'alkali').state; // first try
    expect(isComplete(s)).toBe(true);
    expect(firstTryScore(s)).toBe(2);
    expect(s.mistakes).toBe(2);
    expect(retriedTiles(s).map((t) => [t.z, t.attempts])).toEqual([[2, 3]]);
  });
});

describe('best result: rank by first-try score, tie-break by faster time', () => {
  it('compares score first, then time', () => {
    expect(isBetterSortResult({ score: 10, seconds: 90 }, null)).toBe(true);
    expect(isBetterSortResult({ score: 11, seconds: 300 }, { score: 10, seconds: 40 })).toBe(true);
    expect(isBetterSortResult({ score: 9, seconds: 10 }, { score: 10, seconds: 40 })).toBe(false);
    // Tie on score: faster wins, slower or equal does not.
    expect(isBetterSortResult({ score: 10, seconds: 39 }, { score: 10, seconds: 40 })).toBe(true);
    expect(isBetterSortResult({ score: 10, seconds: 41 }, { score: 10, seconds: 40 })).toBe(false);
    expect(isBetterSortResult({ score: 10, seconds: 40 }, { score: 10, seconds: 40 })).toBe(false);
  });

  function fakeStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, String(v)),
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores score and time together and applies the tie-break', () => {
    const ls = fakeStorage();
    vi.stubGlobal('window', { localStorage: ls });
    const key = 'best:familySort:36';

    expect(recordSortBest(key, { score: 10, seconds: 80 })).toEqual({
      prev: null,
      best: { score: 10, seconds: 80 },
      isNew: false, // first result ever: "Best", not "New best"
    });
    expect(JSON.parse(ls.getItem('eldrills:v1:best:familySort:36') ?? 'null')).toEqual({ score: 10, seconds: 80 });

    // Same score, slower: kept.
    expect(recordSortBest(key, { score: 10, seconds: 95 })).toMatchObject({
      best: { score: 10, seconds: 80 },
      isNew: false,
    });
    // Same score, faster: new best.
    expect(recordSortBest(key, { score: 10, seconds: 61 })).toMatchObject({
      best: { score: 10, seconds: 61 },
      isNew: true,
    });
    // Lower score but much faster: kept.
    expect(recordSortBest(key, { score: 9, seconds: 20 })).toMatchObject({
      best: { score: 10, seconds: 61 },
      isNew: false,
    });
    // Higher score, slower: new best.
    expect(recordSortBest(key, { score: 12, seconds: 200 })).toMatchObject({
      best: { score: 12, seconds: 200 },
      isNew: true,
    });
    expect(JSON.parse(ls.getItem('eldrills:v1:best:familySort:36') ?? 'null')).toEqual({ score: 12, seconds: 200 });
  });

  it('ignores a corrupt stored best and survives blocked storage', () => {
    const ls = fakeStorage();
    ls.setItem('eldrills:v1:best:familySort:20', '{"score":"lots"}');
    vi.stubGlobal('window', { localStorage: ls });
    expect(recordSortBest('best:familySort:20', { score: 5, seconds: 50 }).prev).toBeNull();

    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(recordSortBest('best:familySort:20', { score: 5, seconds: 50 })).toEqual({
      prev: null,
      best: { score: 5, seconds: 50 },
      isNew: false,
    });
  });
});
