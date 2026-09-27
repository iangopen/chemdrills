import { describe, expect, it } from 'vitest';
import { fmtClock, fmtMs } from './format';

describe('time formatting', () => {
  it('fmtClock', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(720)).toBe('12:00');
    expect(fmtClock(61)).toBe('1:01');
  });

  it('fmtMs truncates to tenths', () => {
    expect(fmtMs(0)).toBe('0:00.0');
    expect(fmtMs(252_349)).toBe('4:12.3');
    expect(fmtMs(59_999)).toBe('0:59.9');
    expect(fmtMs(60_000)).toBe('1:00.0');
  });
});
