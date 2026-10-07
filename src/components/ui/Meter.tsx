export interface MeterProps {
  label: string;
  value: number;
  max: number;
  /** Shown instead of a percentage when a count reads better than a ratio. */
  caption?: string;
}

export default function Meter({ label, value, max, caption }: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-xs text-gray-300">
        <span>{label}</span>
        <span className="font-mono">{caption ?? `${Math.round(ratio * 100)}%`}</span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-800"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
      >
        <div className="h-full rounded-full bg-jade-500" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}