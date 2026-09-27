import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys, recordFastest } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeWindow() {
  const m = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
  return { m, win: { localStorage } };
}

describe('recordFastest (ordered games)', () => {
  it('keeps the lowest time, under its own versioned key', () => {
    const { m, win } = fakeWindow();
    vi.stubGlobal('window', win);
    expect(recordFastest(keys.bestTimeMs('nameInOrder'), 250_000)).toEqual({ prev: null, best: 250_000 });
    expect(recordFastest(keys.bestTimeMs('nameInOrder'), 260_000)).toEqual({ prev: 250_000, best: 250_000 });
    expect(recordFastest(keys.bestTimeMs('nameInOrder'), 240_500)).toEqual({ prev: 250_000, best: 240_500 });
    expect(m.get('eldrills:v1:best:nameInOrder')).toBe('240500');
    expect(keys.bestNameAll()).toBe('best:nameAll'); // unchanged
  });

  it('works with storage throwing', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('window', { localStorage: { getItem: boom, setItem: boom } });
    expect(recordFastest(keys.bestTimeMs('reverseOrder'), 1000)).toEqual({ prev: null, best: 1000 });
  });
});
