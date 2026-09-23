// Single source of truth for element data.
//
// Masses: CIAAW/IUPAC "Abridged Standard Atomic Weights 2024"
// (https://www.ciaaw.org/abridged-atomic-weights.htm), copied digit for digit,
// trailing zeros included. Synthetic elements have no standard atomic weight;
// for those the value is the mass number of the most stable (longest-lived)
// known isotope and is displayed in brackets, e.g. [98].

export type Family =
  | 'alkali'
  | 'alkaline'
  | 'transition'
  | 'post'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble'
  | 'lanthanide'
  | 'actinide';

export interface Element {
  z: number;
  symbol: string;
  name: string;
  /** Numeric mass in u (or mass number for synthetic elements). */
  mass: number;
  /** Display form: IUPAC digits as published, or "[n]" for synthetic elements. */
  massText: string;
  synthetic: boolean;
  family: Family;
  period: number;
  /** 1–18, or null for the f-block (La–Lu, Ac–Lr), which sits below the table. */
  group: number | null;
  gridRow: number;
  gridCol: number;
}

/** Order matches the legend in the prototype. */
export const FAMILIES: readonly { id: Family; label: string }[] = [
  { id: 'alkali', label: 'Alkali metal' },
  { id: 'alkaline', label: 'Alkaline earth' },
  { id: 'transition', label: 'Transition metal' },
  { id: 'post', label: 'Post-transition' },
  { id: 'metalloid', label: 'Metalloid' },
  { id: 'nonmetal', label: 'Nonmetal' },
  { id: 'halogen', label: 'Halogen' },
  { id: 'noble', label: 'Noble gas' },
  { id: 'lanthanide', label: 'Lanthanide' },
  { id: 'actinide', label: 'Actinide' },
];

/** Accepted alternate spellings, keyed by z. Primary names use US spelling. */
export const ALT_NAMES: Readonly<Record<number, readonly string[]>> = {
  13: ['aluminium'],
  16: ['sulphur'],
  55: ['caesium'],
};

const RAW = `
H Hydrogen 1.0080
He Helium 4.0026
Li Lithium 6.94
Be Beryllium 9.0122
B Boron 10.81
C Carbon 12.011
N Nitrogen 14.007
O Oxygen 15.999
F Fluorine 18.998
Ne Neon 20.180
Na Sodium 22.990
Mg Magnesium 24.305
Al Aluminum 26.982
Si Silicon 28.085
P Phosphorus 30.974
S Sulfur 32.06
Cl Chlorine 35.45
Ar Argon 39.95
K Potassium 39.098
Ca Calcium 40.078
Sc Scandium 44.956
Ti Titanium 47.867
V Vanadium 50.942
Cr Chromium 51.996
Mn Manganese 54.938
Fe Iron 55.845
Co Cobalt 58.933
Ni Nickel 58.693
Cu Copper 63.546
Zn Zinc 65.38
Ga Gallium 69.723
Ge Germanium 72.630
As Arsenic 74.922
Se Selenium 78.971
Br Bromine 79.904
Kr Krypton 83.798
Rb Rubidium 85.468
Sr Strontium 87.62
Y Yttrium 88.906
Zr Zirconium 91.222
Nb Niobium 92.906
Mo Molybdenum 95.95
Tc Technetium 98
Ru Ruthenium 101.07
Rh Rhodium 102.91
Pd Palladium 106.42
Ag Silver 107.87
Cd Cadmium 112.41
In Indium 114.82
Sn Tin 118.71
Sb Antimony 121.76
Te Tellurium 127.60
I Iodine 126.90
Xe Xenon 131.29
Cs Cesium 132.91
Ba Barium 137.33
La Lanthanum 138.91
Ce Cerium 140.12
Pr Praseodymium 140.91
Nd Neodymium 144.24
Pm Promethium 145
Sm Samarium 150.36
Eu Europium 151.96
Gd Gadolinium 157.25
Tb Terbium 158.93
Dy Dysprosium 162.50
Ho Holmium 164.93
Er Erbium 167.26
Tm Thulium 168.93
Yb Ytterbium 173.05
Lu Lutetium 174.97
Hf Hafnium 178.49
Ta Tantalum 180.95
W Tungsten 183.84
Re Rhenium 186.21
Os Osmium 190.23
Ir Iridium 192.22
Pt Platinum 195.08
Au Gold 196.97
Hg Mercury 200.59
Tl Thallium 204.38
Pb Lead 207.2
Bi Bismuth 208.98
Po Polonium 209
At Astatine 210
Rn Radon 222
Fr Francium 223
Ra Radium 226
Ac Actinium 227
Th Thorium 232.04
Pa Protactinium 231.04
U Uranium 238.03
Np Neptunium 237
Pu Plutonium 244
Am Americium 243
Cm Curium 247
Bk Berkelium 247
Cf Californium 251
Es Einsteinium 252
Fm Fermium 257
Md Mendelevium 258
No Nobelium 259
Lr Lawrencium 266
Rf Rutherfordium 267
Db Dubnium 268
Sg Seaborgium 269
Bh Bohrium 270
Hs Hassium 269
Mt Meitnerium 278
Ds Darmstadtium 281
Rg Roentgenium 282
Cn Copernicium 285
Nh Nihonium 286
Fl Flerovium 289
Mc Moscovium 290
Lv Livermorium 293
Ts Tennessine 294
Og Oganesson 294`;

const between = (z: number, a: number, b: number) => z >= a && z <= b;

function familyOf(z: number): Family {
  if ([3, 11, 19, 37, 55, 87].includes(z)) return 'alkali';
  if ([4, 12, 20, 38, 56, 88].includes(z)) return 'alkaline';
  if (between(z, 57, 71)) return 'lanthanide';
  if (between(z, 89, 103)) return 'actinide';
  if (between(z, 21, 30) || between(z, 39, 48) || between(z, 72, 80) || between(z, 104, 112))
    return 'transition';
  if ([5, 14, 32, 33, 51, 52].includes(z)) return 'metalloid';
  if ([1, 6, 7, 8, 15, 16, 34].includes(z)) return 'nonmetal';
  if ([9, 17, 35, 53, 85, 117].includes(z)) return 'halogen';
  if ([2, 10, 18, 36, 54, 86, 118].includes(z)) return 'noble';
  return 'post';
}

/** [gridRow, gridCol] in the 18-column long-form table. Row 8 is a spacer. */
function gridOf(z: number): [number, number] {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  if (z <= 4) return [2, z - 2];
  if (z <= 10) return [2, z + 8];
  if (z <= 12) return [3, z - 10];
  if (z <= 18) return [3, z];
  if (z <= 36) return [4, z - 18];
  if (z <= 54) return [5, z - 36];
  if (z <= 56) return [6, z - 54];
  if (z <= 71) return [9, z - 54];
  if (z <= 86) return [6, z - 68];
  if (z <= 88) return [7, z - 86];
  if (z <= 103) return [10, z - 86];
  return [7, z - 100];
}

const isSynthetic = (z: number) => z === 43 || z === 61 || (z >= 84 && ![90, 91, 92].includes(z));

export const ELEMENTS: readonly Element[] = RAW.trim()
  .split('\n')
  .map((line, i) => {
    const [symbol = '', name = '', massStr = ''] = line.trim().split(' ');
    const z = i + 1;
    const synthetic = isSynthetic(z);
    const [gridRow, gridCol] = gridOf(z);
    const fBlock = gridRow >= 9;
    return {
      z,
      symbol,
      name,
      mass: Number(massStr),
      massText: synthetic ? `[${massStr}]` : massStr,
      synthetic,
      family: familyOf(z),
      period: fBlock ? gridRow - 3 : gridRow,
      group: fBlock ? null : gridCol,
      gridRow,
      gridCol,
    };
  });

export const ELEMENT_COUNT = 118;

export function elementByZ(z: number): Element {
  const e = ELEMENTS[z - 1];
  if (!e || e.z !== z) throw new Error(`No element with z=${z}`);
  return e;
}

export function acceptedNames(e: Element): string[] {
  return [e.name, ...(ALT_NAMES[e.z] ?? [])];
}
