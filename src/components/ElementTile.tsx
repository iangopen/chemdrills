import type { Element } from '../data/elements';
import type { TileMask } from '../games/types';
import { famStyle } from '../lib/famStyle';

interface Props {
  element: Element;
  /** Fields set to false render as "?". Omit to reveal everything. */
  hide?: TileMask;
  size?: 'lg' | 'sm';
}

/** The core visual: an element cell with number, symbol, name and mass. */
export function ElementTile({ element: e, hide = {}, size = 'lg' }: Props) {
  const show = (k: keyof TileMask) => hide[k] !== false;
  const field = (k: keyof TileMask, cls: string, value: string | number) => (
    <span className={show(k) ? cls : `${cls} hid`} aria-hidden="true">
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

  return (
    <div
      className={size === 'sm' ? 'tile sm' : 'tile'}
      style={famStyle(e.family)}
      role="img"
      aria-label={label}
      data-z={e.z}
      data-family={e.family}
    >
      {field('num', 't-num', e.z)}
      {field('sym', 't-sym', e.symbol)}
      {field('name', 't-name', e.name)}
      {field('mass', 't-mass', e.massText)}
    </div>
  );
}
