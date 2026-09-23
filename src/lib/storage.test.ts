import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys, readNumber, recordBest, writeJSON } from './storage';

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

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error('SecurityError: storage blocked');
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('uses versioned keys', () => {
    const ls = fakeStorage();
    vi.stubGlobal('window', { localStorage: ls });
    writeJSON(keys.best('symbolToName', 36), 7);
    writeJSON(keys.bestNameAll(), 80);
    writeJSON(keys.range(), 54);
    expect(ls.getItem('eldrills:v1:best:symbolToName:36')).toBe('7');
    expect(ls.getItem('eldrills:v1:best:nameAll')).toBe('80');
    expect(ls.getItem('eldrills:v1:range')).toBe('54');
  });

  it('recordBest keeps the maximum', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    expect(recordBest('best:x:20', 5)).toEqual({ prev: 0, best: 5 });
    expect(recordBest('best:x:20', 3)).toEqual({ prev: 5, best: 5 });
    expect(recordBest('best:x:20', 9)).toEqual({ prev: 5, best: 9 });
  });

  it('ignores corrupt values', () => {
    const ls = fakeStorage();
    ls.setItem('eldrills:v1:range', '{not json');
    ls.setItem('eldrills:v1:best:nameAll', '"lots"');
    vi.stubGlobal('window', { localStorage: ls });
    expect(readNumber('range')).toBeNull();
    expect(readNumber('best:nameAll')).toBeNull();
  });

  it('never throws when storage methods throw', () => {
    vi.stubGlobal('window', { localStorage: throwingStorage() });
    expect(() => writeJSON('range', 20)).not.toThrow();
    expect(readNumber('range')).toBeNull();
    expect(recordBest('best:nameAll', 4)).toEqual({ prev: 0, best: 4 });
  });

  it('never throws when the localStorage getter itself throws', () => {
    const win = {};
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
    vi.stubGlobal('window', win);
    expect(() => writeJSON('range', 20)).not.toThrow();
    expect(readNumber('range')).toBeNull();
  });
});
