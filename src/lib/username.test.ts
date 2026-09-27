import { describe, expect, it } from 'vitest';
import { cleanUsername, USERNAME_RE } from './username';

describe('username rule', () => {
  it('accepts 3-20 of [a-z0-9_]', () => {
    for (const ok of ['abc', 'neon_42', 'a'.repeat(20), '___']) expect(USERNAME_RE.test(ok), ok).toBe(true);
  });

  it('rejects short, long, uppercase and other characters', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'Neon', 'ne on', 'né', 'a-b', 'a.b']) {
      expect(USERNAME_RE.test(bad), bad).toBe(false);
    }
  });

  it('cleanUsername lowercases, strips and caps at 20', () => {
    expect(cleanUsername('Neon Star!')).toBe('neonstar');
    expect(cleanUsername('Ünïcode_1')).toBe('ncode_1');
    expect(cleanUsername('x'.repeat(30))).toHaveLength(20);
  });
});
