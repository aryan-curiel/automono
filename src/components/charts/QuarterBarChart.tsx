import { barPath } from "../../lib/chartScale";
import { ChartFrame } from "./ChartFrame";

export interface QuarterBarDatum {
  key: string;
  label: string;
  value: number;
}

export interface QuarterBarChartProps {
  data: QuarterBarDatum[];
  color: string;
  seriesLabel: string;
  formatValue: (value: number) => string;
  formatTooltipValue?: (value: number) => string;
  height?: number;
}

/** A single-series column chart for a fixed set of quarters — thin bars, one hairline
 * gridline set, no legend (one series, so the card title already names it). The bar's
 * data-end (top for a positive value, bottom for a negative one) is the only rounded
 * edge. Hand-rolled inline SVG — no charting dependency. */
export function QuarterBarChart({
  data,
  color,
  seriesLabel,
  formatValue,
  formatTooltipValue,
  height = 160,
}: QuarterBarChartProps) {
  const formatTooltip = formatTooltipValue ?? formatValue;

  return (
    <ChartFrame
      height={height}
      values={data.map((d) => d.value)}
      count={data.length}
      labels={data.map((d) => d.label)}
      formatTick={formatValue}
      ariaLabel={`${seriesLabel}: ${data
        .map((d) => `${d.label} ${formatValue(d.value)}`)
        .join(", ")}`}
      tooltipTitle={(i) => data[i].label}
      tooltipRows={(i) => [{ color, label: seriesLabel, value: formatTooltip(data[i].value) }]}
    >
      {(g) => {
        const bw = Math.min(24, g.band * 0.5);
        return data.map((d, i) => {
          const yv = g.y(d.value);
          const up = yv <= g.baseline;
          return (
            <path
              key={d.key}
              d={barPath(
                g.cx(i) - bw / 2,
                bw,
                up ? yv : g.baseline,
                up ? g.baseline : yv,
                4,
                up ? "top" : "bottom",
              )}
              fill={color}
              fillOpacity={g.hover === null || g.hover === i ? 1 : 0.55}
            />
          );
        });
      }}
    </ChartFrame>
  );
}
