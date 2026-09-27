// The server re-checks every ranked run, so its element names and game limits
// must match the client exactly. These tests keep the SQL and the TS in step.
//
// 0002_elements.sql is GENERATED from src/data/elements.ts by this file:
// `npm run gen:sql` rewrites it; a plain `npm test` fails if it is stale.

import { describe, expect, it } from 'vitest';
import { acceptedNames, ELEMENTS } from '../data/elements';
import { GAMES } from '../games';
import { normalize } from './matching';
import migration0001 from '../../supabase/migrations/0001_accounts_leaderboards.sql?raw';
import migration0003 from '../../supabase/migrations/0003_blocked_words.sql?raw';

function elementsSql(): string {
  const rows = ELEMENTS.map((e) => {
    const names = [...new Set(acceptedNames(e).map(normalize))];
    return `  (${e.z}, '{${names.join(',')}}')`;
  });
  return [
    '-- GENERATED from src/data/elements.ts by src/lib/sqlParity.test.ts (npm run gen:sql).',
    '-- Do not edit by hand. Accepted spellings per element, normalized like normalize()',
    '-- in src/lib/matching.ts, so submit_run can re-check every entry of a ranked run.',
    'insert into public.elements (z, names) values',
    rows.join(',\n') + ';',
    '',
  ].join('\n');
}

describe('supabase SQL parity', () => {
  it('0002_elements.sql matches elements.ts', async () => {
    await expect(elementsSql()).toMatchFileSnapshot('../../supabase/migrations/0002_elements.sql');
  });

  it('ranked_games rows match the ranked game definitions', () => {
    const sql = migration0001;
    const rows = [...sql.matchAll(/\('(\w+)',\s*'(any|asc|desc)',\s*(\d+),\s*(true|false),/g)].map((m) => ({
      id: m[1],
      order: m[2],
      limitMs: Number(m[3]),
      completeOnly: m[4] === 'true',
    }));
    const ranked = GAMES.filter((g) => g.kind === 'fillTable' && g.ranked).map((g) =>
      g.kind === 'fillTable'
        ? {
            id: g.id,
            order: g.order ?? 'any',
            limitMs: g.round.seconds * 1000,
            completeOnly: g.order !== undefined,
          }
        : null,
    );
    expect(rows).toEqual(ranked);
    expect(rows.map((r) => r.id)).toEqual(['nameAll', 'nameInOrder', 'reverseOrder']);
  });

  it('the SQL normalizer mirrors normalize()', () => {
    const sql = migration0001;
    expect(sql).toContain("regexp_replace(lower(s), '[^a-z]', '', 'g')");
    expect(normalize(' Alu-minium! ')).toBe('aluminium');
  });

  it('no blocked word is inside an element name (usernames like "tin_man" must pass)', () => {
    const sql = migration0003;
    const words = [...sql.matchAll(/\('([a-z]+)'\)/g)].map((m) => m[1] ?? '');
    expect(words.length).toBeGreaterThan(30);
    for (const e of ELEMENTS) {
      for (const w of words) expect(normalize(e.name).includes(w), `${w} in ${e.name}`).toBe(false);
    }
  });
});
