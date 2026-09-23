import { RANGES, type RangeMax } from '../lib/quiz';

interface Props {
  value: RangeMax;
  onChange: (max: RangeMax) => void;
}

export function RangePicker({ value, onChange }: Props) {
  return (
    <div className="seg" role="group" aria-label="Which elements">
      {RANGES.map((r) => (
        <button
          key={r.max}
          type="button"
          data-range={r.max}
          aria-pressed={r.max === value}
          onClick={() => onChange(r.max)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
