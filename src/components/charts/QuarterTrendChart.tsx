import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { barPath } from "../../lib/chartScale";
import { ChartFrame } from "./ChartFrame";

export interface QuarterTrendDatum {
  key: string;
  label: string;
  invoiced: number;
  expenses: number;
  net: number;
  status: "completed" | "in_progress" | "none";
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

/** Grouped bars for the two raw inputs (Facturado, Gastos) plus a line for the
 * derived Neto, sharing one € axis. The X-axis tick is a clickable per-quarter
 * declaration-status indicator (dot + label), keeping this chart's pre-existing
 * keyboard-navigable per-quarter drill-down. Hand-rolled inline SVG — no
 * charting dependency. */
export function QuarterTrendChart({
  data,
  invoicedLabel,
  expensesLabel,
  netLabel,
  formatValue,
  onSelectQuarter,
  height = 220,
}: QuarterTrendChartProps) {
  return (
    <>
      <ChartFrame
        height={height}
        bottomPad={36}
        values={data.flatMap((d) => [d.invoiced, d.expenses, d.net])}
        count={data.length}
        formatTick={formatValue}
        ariaLabel={data
          .map(
            (d) =>
              `${d.label}: ${invoicedLabel} ${formatValue(d.invoiced)}, ${expensesLabel} ${formatValue(
                d.expenses,
              )}, ${netLabel} ${formatValue(d.net)}`,
          )
          .join("; ")}
        tooltipTitle={(i) => data[i].label}
        tooltipRows={(i) => [
          { color: "var(--color-accent)", label: invoicedLabel, value: formatValue(data[i].invoiced) },
          { color: "var(--color-info)", label: expensesLabel, value: formatValue(data[i].expenses) },
          { color: "var(--color-ink)", label: netLabel, value: formatValue(data[i].net) },
        ]}
        renderXTick={(i, x, y) => {
          const datum = data[i];
          if (!datum) return null;
          return (
            <g
              transform={`translate(${x},${y})`}
              onClick={() => onSelectQuarter(datum.key)}
              onKeyDown={(e: ReactKeyboardEvent<SVGGElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectQuarter(datum.key);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={datum.label}
              style={{ cursor: "pointer" }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <rect x={-24} y={2} width={48} height={26} fill="transparent" />
              <circle
                cx={0}
                cy={11}
                r={2.5}
                fill={STATUS_DOT_COLOR[datum.status]}
                fillOpacity={datum.status === "none" ? 0.4 : 1}
              />
              <text x={0} y={24} textAnchor="middle" fontSize={11} fill="var(--color-ink-soft)">
                {datum.label}
              </text>
            </g>
          );
        }}
      >
        {(g) => {
          const gbw = Math.min(20, g.band * 0.28);
          const bar = (cx: number, value: number, fill: string, key: string) => {
            const yv = g.y(value);
            const up = yv <= g.baseline;
            return (
              <path
                key={key}
                d={barPath(cx, gbw, up ? yv : g.baseline, up ? g.baseline : yv, 4, up ? "top" : "bottom")}
                fill={fill}
              />
            );
          };
          const linePoints = data.map((d, i) => `${g.cx(i)},${g.y(d.net)}`).join(" ");
          return (
            <>
              {data.map((d, i) => (
                <g key={d.key} fillOpacity={g.hover === null || g.hover === i ? 1 : 0.5}>
                  {bar(g.cx(i) - gbw - 1, d.invoiced, "var(--color-accent)", "inv")}
                  {bar(g.cx(i) + 1, d.expenses, "var(--color-info)", "exp")}
                </g>
              ))}
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {data.map((d, i) => (
                <circle key={d.key} cx={g.cx(i)} cy={g.y(d.net)} r={4} fill="var(--color-ink)" />
              ))}
            </>
          );
        }}
      </ChartFrame>
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
