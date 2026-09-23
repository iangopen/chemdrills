import { describe, expect, it } from 'vitest';
import { ELEMENTS, elementByZ } from '../data/elements';
import { GAMES } from './index';
import { guessMass } from './guessMass';
import { symbolToName } from './symbolToName';

describe('game registry', () => {
  it('has unique ids and codes', () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((g) => g.code)).size).toBe(GAMES.length);
  });

  it('quiz games make distinct questions from the pool only', () => {
    const pool = ELEMENTS.filter((e) => e.z <= 20);
    for (const g of GAMES) {
      if (g.kind !== 'quiz') continue;
      const qs = g.makeQuestions(pool, g.round.questions);
      expect(qs).toHaveLength(10);
      expect(new Set(qs.map((e) => e.z)).size).toBe(10);
      expect(qs.every((e) => e.z <= 20)).toBe(true);
    }
  });

  it('symbol to name: close answers score and show the spelling', () => {
    const H = elementByZ(1);
    const a = symbolToName.check(H, 'hydrogn');
    const pts = symbolToName.score(H, a);
    expect(pts).toBe(1);
    expect(symbolToName.feedback(H, 'hydrogn', a, pts)).toBe('Correct, spelled Hydrogen.');
  });

  it('guess the mass: under 60 is a miss, synthetic note shown', () => {
    const Tc = elementByZ(43);
    const a = guessMass.check(Tc, ' 98 ');
    const pts = guessMass.score(Tc, a);
    expect(pts).toBe(100);
    expect(guessMass.isMiss(pts)).toBe(false);
    expect(guessMass.isMiss(59)).toBe(true);
    expect(guessMass.feedback(Tc, ' 98 ', a, pts)).toBe(
      'Technetium is [98] u. You said 98: 100 points. Bracketed masses are the most stable isotope.',
    );
  });
});
