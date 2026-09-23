import type { CSSProperties } from 'react';
import { ELEMENTS, FAMILIES } from '../data/elements';
import { famStyle } from '../lib/famStyle';

interface Props {
  found: ReadonlySet<number>;
  /** When true, unfound elements are revealed with a dashed outline. */
  revealMissed: boolean;
}

/** 18-column long-form table. Scrolls inside its own wrapper on narrow screens. */
export function PeriodicTable({ found, revealMissed }: Props) {
  return (
    <>
      <div className="tablewrap" tabIndex={0} role="region" aria-label="Periodic table">
        <ol className="pt">
          {ELEMENTS.map((e) => {
            const isFound = found.has(e.z);
            const isMissed = revealMissed && !isFound;
            const cls = isFound ? 'cell found pop' : isMissed ? 'cell missed' : 'cell';
            const label = isFound
              ? `${e.z}, ${e.name}`
              : isMissed
                ? `${e.z}, ${e.name}, missed`
                : `${e.z}, not yet named`;
            return (
              <li
                key={e.z}
                id={`c${e.z}`}
                className={cls}
                style={{ ...famStyle(e.family), gridRow: e.gridRow, gridColumn: e.gridCol }}
                aria-label={label}
                data-z={e.z}
                data-family={e.family}
              >
                <span className="cn" aria-hidden="true">
                  {e.z}
                </span>
                <span className="cs" aria-hidden="true">
                  {isFound || isMissed ? e.symbol : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ul className="legend" aria-label="Families">
        {FAMILIES.map((f) => (
          <li key={f.id} style={{ '--sw': `var(--f-${f.id})` } as CSSProperties}>
            {f.label}
          </li>
        ))}
      </ul>
    </>
  );
}
