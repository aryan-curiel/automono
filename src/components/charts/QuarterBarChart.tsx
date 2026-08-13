import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface QuarterBarDatum {
  key: string;
  label: string;
  value: number;
}

export interface QuarterBarChartProps {
  data: QuarterBarDatum[];
  color: string;
  formatValue: (value: number) => string;
  formatTooltipValue?: (value: number) => string;
  height?: number;
}

/** A single-series column chart for a fixed set of quarters — thin bars, one hairline
 * gridline set, no legend (one series, so the card title already names it). Rounds the
 * top corner only, which is correct for the common (positive) case; a negative bar
 * (rendered below the zero reference line) would ideally round its bottom instead —
 * skipped rather than building a sign-aware custom bar shape for that rare case. */
export function QuarterBarChart({
  data,
  color,
  formatValue,
  formatTooltipValue,
  height = 160,
}: QuarterBarChartProps) {
  const hasNegative = data.some((d) => d.value < 0);
  const formatTooltip = formatTooltipValue ?? formatValue;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
          allowDecimals={false}
          width={56}
        />
        {hasNegative && <ReferenceLine y={0} stroke="var(--color-border)" />}
        <Tooltip
          cursor={{ fill: "var(--color-surface-alt)" }}
          formatter={(value) => formatTooltip(Number(value))}
          labelStyle={{ color: "var(--color-ink)", fontWeight: 600, marginBottom: 4 }}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
