import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
 * legend (dot + label) matching this app's existing small-caption legend style rather
 * than Recharts' default legend chrome. Segment `a` stacks on the baseline (bottom,
 * square on both ends — neither touches the bar's free/data end); `b` stacks on top
 * of it and owns the only rounded corners, since its top is the bar's true data-end. */
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
            width="auto"
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-alt)" }}
            formatter={(value) => formatValue(Number(value))}
            labelStyle={{ color: "var(--color-ink)", fontWeight: 600, marginBottom: 4 }}
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="a" name={aLabel} stackId="quarter" fill={aColor} maxBarSize={24} />
          <Bar
            dataKey="b"
            name={bLabel}
            stackId="quarter"
            fill={bColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
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
