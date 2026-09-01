import { barPath } from "../../lib/chartScale";
import { ChartFrame } from "./ChartFrame";

export interface StackedQuarterBarDatum {
  key: string;
  label: string;
  a: number;
  b: number;
}

export interface StackedQuarterBarChartProps {
  data: StackedQuarterBarDatum[];
  aColor: string;
  bColor: string;
  aLabel: string;
  bLabel: string;
  formatValue: (value: number) => string;
  height?: number;
}

/** A two-series stacked column chart for a fixed set of quarters, with a hand-rolled
 * legend (dot + label) matching this app's small-caption legend style. Segment `a`
 * stacks on the baseline (square on both ends); `b` stacks on top of it with a 2px
 * surface gap and owns the only rounded corners, since its top is the bar's true
 * data-end. Hand-rolled inline SVG — no charting dependency. */
export function StackedQuarterBarChart({
  data,
  aColor,
  bColor,
  aLabel,
  bLabel,
  formatValue,
  height = 160,
}: StackedQuarterBarChartProps) {
  return (
    <>
      <ChartFrame
        height={height}
        values={data.map((d) => d.a + d.b)}
        count={data.length}
        labels={data.map((d) => d.label)}
        formatTick={formatValue}
        ariaLabel={`${data
          .map((d) => `${d.label}: ${aLabel} ${formatValue(d.a)}, ${bLabel} ${formatValue(d.b)}`)
          .join("; ")}`}
        tooltipTitle={(i) => data[i].label}
        tooltipRows={(i) => [
          { color: aColor, label: aLabel, value: formatValue(data[i].a) },
          { color: bColor, label: bLabel, value: formatValue(data[i].b) },
        ]}
      >
        {(g) => {
          const bw = Math.min(24, g.band * 0.5);
          return data.map((d, i) => {
            const x = g.cx(i) - bw / 2;
            const yA = g.y(d.a);
            const yB = g.y(d.a + d.b);
            const bBottom = d.a > 0 ? yA - 2 : g.baseline;
            const dim = g.hover === null || g.hover === i ? 1 : 0.55;
            return (
              <g key={d.key} fillOpacity={dim}>
                {d.a > 0 && <path d={barPath(x, bw, yA, g.baseline, 4, "none")} fill={aColor} />}
                {d.b > 0 && yB < bBottom && (
                  <path d={barPath(x, bw, yB, bBottom, 4, "top")} fill={bColor} />
                )}
              </g>
            );
          });
        }}
      </ChartFrame>
      <div className="flex items-center gap-4 mt-1 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: aColor }} />
          {aLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: bColor }} />
          {bLabel}
        </span>
      </div>
    </>
  );
}
