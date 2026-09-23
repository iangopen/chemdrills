import type { CSSProperties } from 'react';
import type { Element, Family } from '../data/elements';
import type { TileMask } from '../games/types';
import { famStyle } from '../lib/famStyle';

interface Props {
  element: Element;
  /** Fields set to false render as "?". Omit to reveal everything. */
  hide?: TileMask;
  /** lg: prompt tile. sm: results and tray. xs: number + symbol only, for stacking. */
  size?: 'lg' | 'sm' | 'xs';
  /**
   * 'family' colors the tile by chemical family. 'neutral' uses a neutral
   * color and leaves the family out of the DOM, for games where the family
   * IS the answer (Family Sort's tray).
   */
  tone?: 'family' | 'neutral';
  /** Paint with this family token instead of the element's own (a sort bucket's color). */
  color?: Family;
  /** Set when the tile sits inside a control that carries its own label. */
  decorative?: boolean;
}

const NEUTRAL = { '--fam': 'var(--tile-neutral)' } as CSSProperties;
/** Name length as a CSS variable, so small tiles can shrink long names to fit. */
const NAME_LEN = (name: string) => ({ '--len': name.length }) as CSSProperties;

/** The core visual: an element cell with number, symbol, name and mass. */
export function ElementTile({
  element: e,
  hide = {},
  size = 'lg',
  tone = 'family',
  color,
  decorative = false,
}: Props) {
  const show = (k: keyof TileMask) => hide[k] !== false;
  const field = (k: keyof TileMask, cls: string, value: string | number, style?: CSSProperties) => (
    <span className={show(k) ? cls : `${cls} hid`} aria-hidden="true" style={style}>
      {show(k) ? value : '?'}
    </span>
  );

  // Screen readers get the visible fields only, so the prompt is not given away.
  const spoken = [
    show('sym') && `symbol ${e.symbol}`,
    show('num') && `atomic number ${e.z}`,
    show('name') && e.name,
    show('mass') && `mass ${e.massText}`,
  ].filter(Boolean);
  const label = `Element tile: ${spoken.join(', ')}`;
  const neutral = tone === 'neutral';
  const paint = color ?? e.family;

  return (
    <div
      className={size === 'lg' ? 'tile' : `tile ${size}`}
      style={neutral ? NEUTRAL : famStyle(paint)}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      data-z={e.z}
      data-family={neutral ? undefined : paint}
      data-tone={tone}
    >
      {field('num', 't-num', e.z)}
      {field('sym', 't-sym', e.symbol)}
      {size !== 'xs' && field('name', 't-name', e.name, NAME_LEN(e.name))}
      {size !== 'xs' && field('mass', 't-mass', e.massText)}
    </div>
  );
}
