/** Whole seconds as m:ss. */
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Milliseconds as m:ss.t (tenths, truncated). Ranked times are shown this way everywhere. */
export function fmtMs(ms: number): string {
  const tenths = Math.floor(ms / 100);
  return `${fmtClock(Math.floor(tenths / 10))}.${tenths % 10}`;
}
