export interface ChartTooltipRow {
  color?: string;
  label: string;
  value: string;
}

/** Floating hover readout for the hand-rolled charts, styled to match the
 * Recharts tooltip it replaces (surface background, hairline border, 8px
 * radius). Absolutely positioned inside the chart's `position: relative`
 * wrapper; `x` is the anchor in px and is clamped to stay on-card. */
export function ChartTooltip({
  x,
  containerWidth,
  title,
  rows,
}: {
  x: number;
  containerWidth: number;
  title: string;
  rows: ChartTooltipRow[];
}) {
  const left = Math.max(64, Math.min(x, containerWidth - 64));
  return (
    <div
      className="absolute top-1 z-10 -translate-x-1/2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs shadow-float pointer-events-none"
      style={{ left }}
    >
      <div className="font-semibold text-ink mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
          {r.color && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: r.color }}
              aria-hidden
            />
          )}
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-medium text-ink font-mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
