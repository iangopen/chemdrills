import { describe, expect, it } from 'vitest';
import { massPoints, massTolerance, parseGuess } from './scoring';

describe('mass scoring', () => {
  it('tolerance is max(2, 0.08 x mass)', () => {
    expect(massTolerance(1.008)).toBe(2);
    expect(massTolerance(25)).toBe(2);
    expect(massTolerance(100)).toBe(8);
    expect(massTolerance(238.03)).toBeCloseTo(19.0424);
  });

  it('an exact guess scores 100', () => {
    expect(massPoints(55.845, 55.845)).toBe(100);
  });

  it('points fall linearly to 0 at the tolerance', () => {
    expect(massPoints(100, 104)).toBe(50); // tol 8, off by 4
    expect(massPoints(100, 96)).toBe(50);
    expect(massPoints(100, 108)).toBe(0);
    expect(massPoints(100, 500)).toBe(0);
    expect(massPoints(12.011, 13.011)).toBe(50); // tol floor of 2
  });

  it('rounds to the nearest point', () => {
    // tol 8: 1 - 1/8 = 0.875 -> 87.5 -> 88
    expect(massPoints(100, 101)).toBe(88);
  });

  it('non-numeric guesses score 0', () => {
    expect(massPoints(10, Number.NaN)).toBe(0);
    expect(parseGuess('abc')).toBeNaN();
    expect(parseGuess('35.5')).toBe(35.5);
    expect(parseGuess('35,5')).toBe(35.5);
  });
});
