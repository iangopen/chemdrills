import type { CSSProperties } from 'react';
import type { Family } from '../data/elements';

/** Inline style that sets --fam to a family's color token. */
export const famStyle = (family: Family) => ({ '--fam': `var(--f-${family})` }) as CSSProperties;
