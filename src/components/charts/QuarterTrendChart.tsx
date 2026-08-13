import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface QuarterTrendDatum {
  key: string;
  label: string;
  invoiced: number;
  expenses: number;
  net: number;
  status: "completed" | "in_progress" | "none";
  locked: boolean;
}

export interface QuarterTrendChartProps {
  data: QuarterTrendDatum[];
  invoicedLabel: string;
  expensesLabel: string;
  netLabel: string;
  formatValue: (value: number) => string;
  onSelectQuarter: (key: string) => void;
  height?: number;
}

const STATUS_DOT_COLOR: Record<QuarterTrendDatum["status"], string> = {
  completed: "var(--color-success)",
  in_progress: "var(--color-info)",
  none: "var(--color-ink-soft)",
};

/** Custom X-axis tick: a status dot (or a hand-drawn padlock when the quarter is
 * locked out by the RETA start date) above the quarter label, the whole thing
 * clickable — replaces the plain axis label to keep this chart's pre-existing
 * per-quarter navigation. Drawn as raw SVG rather than the Phosphor `Lock` icon
 * component, which would nest a second `<svg>` inside a Recharts-rendered tick
 * for no real benefit at this size (~8px). */
function QuarterTick({
  x,
  y,
  index,
  data,
  onSelectQuarter,
}: {
  x: number | string;
  y: number | string;
  index: number;
  data: QuarterTrendDatum[];
  onSelectQuarter: (key: string) => void;
}) {
  const datum = data[index];
  if (!datum) return null;

  const handleActivate = datum.locked ? undefined : () => onSelectQuarter(datum.key);

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={handleActivate}
      onKeyDown={
        handleActivate
          ? (e: ReactKeyboardEvent<SVGGElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
      tabIndex={datum.locked ? undefined : 0}
      role={datum.locked ? undefined : "button"}
      aria-label={datum.label}
      style={{ cursor: datum.locked ? "default" : "pointer" }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <rect x={-24} y={2} width={48} height={26} fill="transparent" />
      {datum.locked ? (
        <g transform="translate(-4,8)" fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.2}>
          <rect x={0} y={3} width={8} height={6} rx={1} />
          <path d="M1.5 3 V1.5 a2.5 2.5 0 0 1 5 0 V3" />
        </g>
      ) : (
        <circle
          cx={0}
          cy={11}
          r={2.5}
          fill={STATUS_DOT_COLOR[datum.status]}
          fillOpacity={datum.status === "none" ? 0.4 : 1}
        />
      )}
      <text x={0} y={24} textAnchor="middle" fontSize={11} fill="var(--color-ink-soft)">
        {datum.label}
      </text>
    </g>
  );
}

/** Grouped bars for the two raw inputs (Facturado, Gastos) plus a line for the
 * derived Neto, sharing one € axis. The X-axis tick is a clickable per-quarter
 * status indicator, not a plain label — see `QuarterTick`. */
export function QuarterTrendChart({
  data,
  invoicedLabel,
  expensesLabel,
  netLabel,
  formatValue,
  onSelectQuarter,
  height = 220,
}: QuarterTrendChartProps) {
  const hasNegativeNet = data.some((d) => d.net < 0);

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            height={40}
            tick={(props) => (
              <QuarterTick
                x={props.x}
                y={props.y}
                index={props.index}
                data={data}
                onSelectQuarter={onSelectQuarter}
              />
            )}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
            allowDecimals={false}
            width="auto"
          />
          {hasNegativeNet && <ReferenceLine y={0} stroke="var(--color-border)" />}
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
          <Bar
            dataKey="invoiced"
            name={invoicedLabel}
            fill="var(--color-accent)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <Bar
            dataKey="expenses"
            name={expensesLabel}
            fill="var(--color-info)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <Line
            dataKey="net"
            name={netLabel}
            stroke="var(--color-ink)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--color-ink)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-1 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
          {invoicedLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-info)" }} />
          {expensesLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 rounded-full" style={{ background: "var(--color-ink)" }} />
          {netLabel}
        </span>
      </div>
    </>
  );
}
