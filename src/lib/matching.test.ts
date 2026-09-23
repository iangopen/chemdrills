import { describe, expect, it } from 'vitest';
import { ELEMENTS, elementByZ } from '../data/elements';
import {
  findExactElement,
  levenshtein,
  matchInteger,
  matchName,
  matchNameExact,
  matchNameOrSymbol,
  normalize,
} from './matching';

const H = elementByZ(1);
const Al = elementByZ(13);
const S = elementByZ(16);
const Fe = elementByZ(26);
const Sn = elementByZ(50);
const Cs = elementByZ(55);

describe('normalize', () => {
  it('lowercases and strips every non-letter', () => {
    expect(normalize('  Hy-dro gen 1! ')).toBe('hydrogen');
    expect(normalize('OXY.gen')).toBe('oxygen');
    expect(normalize('123')).toBe('');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('hydrogen', 'hydrogen')).toBe(0);
    expect(levenshtein('hydrogen', 'hydrogn')).toBe(1);
    expect(levenshtein('hydrogen', 'hydrogeen')).toBe(1);
    expect(levenshtein('hydrogen', 'hydrigen')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('matchName (quiz modes)', () => {
  it('accepts alternate spellings as exact', () => {
    expect(matchName(Al, 'aluminium')).toBe('exact');
    expect(matchName(Al, 'Aluminum')).toBe('exact');
    expect(matchName(S, 'sulphur')).toBe('exact');
    expect(matchName(Cs, 'CAESIUM')).toBe('exact');
  });

  it('accepts a 1-letter typo for inputs of 5+ letters as close', () => {
    expect(matchName(H, 'hydrogn')).toBe('close');
    expect(matchName(Al, 'aluminiun')).toBe('close'); // typo of the alternate spelling
  });

  it('rejects typos on short inputs and 2+ edits', () => {
    expect(matchName(Sn, 'tn')).toBeNull();
    expect(matchName(Fe, 'irn')).toBeNull(); // 1 edit but only 3 letters
    expect(matchName(Fe, 'iorn')).toBeNull(); // 4 letters
    expect(matchName(H, 'hdrogn')).toBeNull(); // 2 edits
  });

  it('rejects empty input', () => {
    expect(matchName(H, '')).toBeNull();
    expect(matchName(H, '  12 ')).toBeNull();
  });
});

describe('matchNameExact (Name Them All)', () => {
  it('rejects the 1-letter typo a quiz would accept', () => {
    expect(matchName(H, 'hydrogn')).toBe('close');
    expect(matchNameExact(H, 'hydrogn')).toBe(false);
  });

  it('accepts exact names and alternate spellings, any case', () => {
    expect(matchNameExact(H, 'HYDROGEN')).toBe(true);
    expect(matchNameExact(Al, 'aluminium')).toBe(true);
    expect(matchNameExact(Al, 'aluminum')).toBe(true);
  });

  it('findExactElement skips found elements and never fuzzes', () => {
    expect(findExactElement(ELEMENTS, 'caesium', new Set())?.z).toBe(55);
    expect(findExactElement(ELEMENTS, 'cesium', new Set([55]))).toBeUndefined();
    // One edit from "boron"; a quiz would accept it, Name Them All must not.
    expect(findExactElement(ELEMENTS, 'boroon', new Set())).toBeUndefined();
    // Partial names while typing never lock anything in.
    expect(findExactElement(ELEMENTS, 'bor', new Set())).toBeUndefined();
  });
});

describe('matchNameOrSymbol (Number to element)', () => {
  it('accepts the symbol case-insensitively', () => {
    expect(matchNameOrSymbol(Fe, 'Fe')).toBe('exact');
    expect(matchNameOrSymbol(Fe, 'fe')).toBe('exact');
    expect(matchNameOrSymbol(Fe, 'FE')).toBe('exact');
    expect(matchNameOrSymbol(Fe, ' fE ')).toBe('exact');
  });

  it('still accepts the name, and rejects other symbols', () => {
    expect(matchNameOrSymbol(Fe, 'iron')).toBe('exact');
    expect(matchNameOrSymbol(Fe, 'F')).toBeNull();
    expect(matchNameOrSymbol(Fe, 'Fr')).toBeNull();
  });
});

describe('matchInteger (Element to number)', () => {
  it('parses integers like the prototype', () => {
    expect(matchInteger(26, '26')).toBe('exact');
    expect(matchInteger(26, ' 26 ')).toBe('exact');
    expect(matchInteger(26, '27')).toBeNull();
    expect(matchInteger(26, 'abc')).toBeNull();
  });
});
