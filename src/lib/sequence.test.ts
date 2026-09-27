import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../data/elements';
import { findNextInOrder, nextZ } from './sequence';

const set = (...z: number[]) => new Set(z);

describe('nextZ', () => {
  it('ascending starts at 1 and walks up', () => {
    expect(nextZ('asc', set(), 118)).toBe(1);
    expect(nextZ('asc', set(1, 2, 3), 118)).toBe(4);
  });

  it('descending starts at 118 and walks down', () => {
    expect(nextZ('desc', set(), 118)).toBe(118);
    expect(nextZ('desc', set(118, 117), 118)).toBe(116);
  });

  it('is undefined once every element is found', () => {
    const all = new Set(ELEMENTS.map((e) => e.z));
    expect(nextZ('asc', all, 118)).toBeUndefined();
    expect(nextZ('desc', all, 118)).toBeUndefined();
  });
});

describe('findNextInOrder', () => {
  it('ascending accepts only the next element', () => {
    expect(findNextInOrder(ELEMENTS, 'asc', 'hydrogen', set())?.z).toBe(1);
    expect(findNextInOrder(ELEMENTS, 'asc', 'Helium', set(1))?.z).toBe(2);
    // Right name, wrong position: rejected.
    expect(findNextInOrder(ELEMENTS, 'asc', 'helium', set())).toBeUndefined();
    expect(findNextInOrder(ELEMENTS, 'asc', 'lithium', set(1))).toBeUndefined();
    // Already found: rejected.
    expect(findNextInOrder(ELEMENTS, 'asc', 'hydrogen', set(1))).toBeUndefined();
  });

  it('descending accepts only the next element', () => {
    expect(findNextInOrder(ELEMENTS, 'desc', 'oganesson', set())?.z).toBe(118);
    expect(findNextInOrder(ELEMENTS, 'desc', 'Tennessine', set(118))?.z).toBe(117);
    expect(findNextInOrder(ELEMENTS, 'desc', 'hydrogen', set())).toBeUndefined();
    expect(findNextInOrder(ELEMENTS, 'desc', 'livermorium', set(118))).toBeUndefined();
  });

  it('accepts alternate spellings in both orders', () => {
    const upTo = (n: number) => new Set(ELEMENTS.filter((e) => e.z <= n).map((e) => e.z));
    const downTo = (n: number) => new Set(ELEMENTS.filter((e) => e.z >= n).map((e) => e.z));
    expect(findNextInOrder(ELEMENTS, 'asc', 'aluminium', upTo(12))?.z).toBe(13);
    expect(findNextInOrder(ELEMENTS, 'asc', 'sulphur', upTo(15))?.z).toBe(16);
    expect(findNextInOrder(ELEMENTS, 'desc', 'caesium', downTo(56))?.z).toBe(55);
    expect(findNextInOrder(ELEMENTS, 'desc', 'Aluminum', downTo(14))?.z).toBe(13);
  });

  it('is exact: no fuzzy matches, no symbols', () => {
    expect(findNextInOrder(ELEMENTS, 'asc', 'hydrogn', set())).toBeUndefined();
    expect(findNextInOrder(ELEMENTS, 'asc', 'H', set())).toBeUndefined();
    expect(findNextInOrder(ELEMENTS, 'asc', '', set())).toBeUndefined();
  });

  it('a full run in either order names all 118 exactly once', () => {
    for (const order of ['asc', 'desc'] as const) {
      const found = new Set<number>();
      const seq: number[] = [];
      for (;;) {
        const z = nextZ(order, found, 118);
        if (z === undefined) break;
        const e = findNextInOrder(ELEMENTS, order, ELEMENTS[z - 1]?.name ?? '', found);
        expect(e?.z).toBe(z);
        found.add(z);
        seq.push(z);
      }
      expect(seq).toHaveLength(118);
      expect(seq[0]).toBe(order === 'asc' ? 1 : 118);
    }
  });
});
