import { describe, expect, it } from 'vitest';
import { ALT_NAMES, ELEMENTS, elementByZ, type Family } from './elements';

// The standard long-form table, drawn by hand so the test does not share
// logic with the position code it checks. "." = empty cell. Row 8 is the spacer.
const LAYOUT = `
H  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  He
Li Be .  .  .  .  .  .  .  .  .  .  B  C  N  O  F  Ne
Na Mg .  .  .  .  .  .  .  .  .  .  Al Si P  S  Cl Ar
K  Ca Sc Ti V  Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr
Rb Sr Y  Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I  Xe
Cs Ba .  Hf Ta W  Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn
Fr Ra .  Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og
.  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
.  .  La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu .
.  .  Ac Th Pa U  Np Pu Am Cm Bk Cf Es Fm Md No Lr .
`;

const EXPECTED_FAMILIES: Record<Family, number[]> = {
  alkali: [3, 11, 19, 37, 55, 87],
  alkaline: [4, 12, 20, 38, 56, 88],
  transition: [
    ...range(21, 30), ...range(39, 48), ...range(72, 80), ...range(104, 112),
  ],
  lanthanide: range(57, 71),
  actinide: range(89, 103),
  metalloid: [5, 14, 32, 33, 51, 52],
  nonmetal: [1, 6, 7, 8, 15, 16, 34],
  halogen: [9, 17, 35, 53, 85, 117],
  noble: [2, 10, 18, 36, 54, 86, 118],
  post: [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116],
};

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

describe('element data', () => {
  it('has exactly 118 entries with z running 1..118, no gaps', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
  });

  it('has unique symbols and names', () => {
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.name.toLowerCase())).size).toBe(118);
  });

  it('places every element where the standard long-form table does', () => {
    const cells = LAYOUT.trim().split('\n').map((row) => row.trim().split(/\s+/));
    expect(cells).toHaveLength(10);
    const seen = new Set<string>();
    cells.forEach((row, r) => {
      expect(row).toHaveLength(18);
      row.forEach((sym, c) => {
        if (sym === '.') return;
        seen.add(sym);
        const e = ELEMENTS.find((x) => x.symbol === sym);
        expect(e, sym).toBeDefined();
        expect([e?.gridRow, e?.gridCol], sym).toEqual([r + 1, c + 1]);
      });
    });
    expect(seen.size).toBe(118);
  });

  it('assigns every family per the spec, covering all 118 exactly once', () => {
    const all = Object.values(EXPECTED_FAMILIES).flat();
    expect(all).toHaveLength(118);
    expect(new Set(all).size).toBe(118);
    for (const [family, zs] of Object.entries(EXPECTED_FAMILIES)) {
      for (const z of zs) expect(elementByZ(z).family, `z=${z}`).toBe(family);
    }
  });

  it('derives period and group from the grid (f-block has no group)', () => {
    expect(elementByZ(26)).toMatchObject({ period: 4, group: 8 });
    expect(elementByZ(57)).toMatchObject({ period: 6, group: null });
    expect(elementByZ(103)).toMatchObject({ period: 7, group: null });
    expect(elementByZ(118)).toMatchObject({ period: 7, group: 18 });
  });

  it('marks Tc, Pm and Z >= 84 except Th/Pa/U as synthetic', () => {
    const synthetic = ELEMENTS.filter((e) => e.synthetic).map((e) => e.z);
    expect(synthetic).toEqual([43, 61, ...range(84, 89), ...range(93, 118)]);
  });

  it('brackets synthetic masses and keeps IUPAC digits for the rest', () => {
    expect(elementByZ(43).massText).toBe('[98]');
    expect(elementByZ(118).massText).toBe('[294]');
    expect(elementByZ(90).massText).toBe('232.04');
    // Trailing zeros are significant and must survive (the prototype lost them).
    expect(elementByZ(10).massText).toBe('20.180');
    expect(elementByZ(52).massText).toBe('127.60');
    // Values that drifted in the hand-typed prototype, fixed to IUPAC 2024.
    expect(elementByZ(18).mass).toBe(39.95);
    expect(elementByZ(40).mass).toBe(91.222);
    for (const e of ELEMENTS) {
      expect(Number.isFinite(e.mass) && e.mass > 0, e.symbol).toBe(true);
      expect(e.massText.replace(/[[\]]/g, ''), e.symbol).toBe(
        e.synthetic ? String(e.mass) : e.massText,
      );
    }
  });

  it('masses increase with z except the known inversions', () => {
    const inversions = ELEMENTS.slice(1)
      .filter((e, i) => e.mass < (ELEMENTS[i]?.mass ?? 0))
      .map((e) => e.symbol);
    // Ar>K, Co>Ni, Te>I, Th>Pa, U>Np, Pu>Am, Hs<Sg and Og=Ts are the real ones.
    expect(inversions).toEqual(['K', 'Ni', 'I', 'Pa', 'Np', 'Am', 'Hs']);
  });

  it('lists the alternate spellings', () => {
    expect(ALT_NAMES).toEqual({ 13: ['aluminium'], 16: ['sulphur'], 55: ['caesium'] });
    expect(elementByZ(13).name).toBe('Aluminum');
    expect(elementByZ(16).name).toBe('Sulfur');
    expect(elementByZ(55).name).toBe('Cesium');
  });
});
