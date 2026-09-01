import { useState } from "react";
import type { ReactNode } from "react";
import { axisDomain, linearScale } from "../../lib/chartScale";
import { ChartTooltip } from "./ChartTooltip";
import type { ChartTooltipRow } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

export interface ChartGeom {
  /** left edge of the plot area */
  x0: number;
  /** top edge of the plot area */
  y0: number;
  plotW: number;
  plotH: number;
  /** width of one category slot */
  band: number;
  /** x pixel of category `i`'s centre */
  cx: (i: number) => number;
  /** value -> y pixel */
  y: (v: number) => number;
  /** y pixel of the 0 line, clamped into the plot */
  baseline: number;
  /** index of the category currently hovered, or null */
  hover: number | null;
}

/** Shared SVG scaffold + hover layer for the dashboard's hand-rolled charts:
 * a measured-width wrapper, horizontal "nice" gridlines with € labels, a
 * baseline x-axis, per-category x ticks, a transparent hover band per
 * category, and the floating tooltip. The marks are supplied by `children` as
 * a function of the resolved geometry. Everything is themed through CSS vars,
 * so light/dark and the locked accent are inherited, not re-declared. Charts
 * render statically — no mount animation (the global
 * `prefers-reduced-motion` rule in `index.css` covers any CSS transition). */
export function ChartFrame({
  height,
  values,
  count,
  formatTick,
  ariaLabel,
  bottomPad = 28,
  labels,
  renderXTick,
  tooltipTitle,
  tooltipRows,
  children,
}: {
  height: number;
  values: number[];
  count: number;
  formatTick: (n: number) => string;
  ariaLabel: string;
  bottomPad?: number;
  labels?: string[];
  renderXTick?: (i: number, x: number, y: number) => ReactNode;
  tooltipTitle?: (i: number) => string;
  tooltipRows?: (i: number) => ChartTooltipRow[];
  children: (geom: ChartGeom) => ReactNode;
}) {
  const [wrapRef, width] = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);

  const domain = axisDomain(values);
  const tickTextW = Math.max(...domain.ticks.map((t) => formatTick(t).length)) * 6.2 + 14;
  const leftPad = Math.min(96, Math.max(40, tickTextW));
  const pad = { top: 8, right: 8, bottom: bottomPad, left: leftPad };

  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = Math.max(0, height - pad.top - pad.bottom);
  const band = plotW / Math.max(1, count);
  const y = linearScale(domain, pad.top, plotH);
  const cx = (i: number) => pad.left + band * (i + 0.5);
  const baseline = Math.max(pad.top, Math.min(pad.top + plotH, y(0)));

  const geom: ChartGeom = {
    x0: pad.left,
    y0: pad.top,
    plotW,
    plotH,
    band,
    cx,
    y,
    baseline,
    hover,
  };

  const showTooltip = hover !== null && tooltipRows && tooltipTitle;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {domain.ticks.map((t) => {
          const ty = y(t);
          return (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + plotW} y1={ty} y2={ty} stroke="var(--color-border)" />
              <text
                x={pad.left - 8}
                y={ty + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-ink-soft)"
              >
                {formatTick(t)}
              </text>
            </g>
          );
        })}

        <line
          x1={pad.left}
          x2={pad.left + plotW}
          y1={baseline}
          y2={baseline}
          stroke="var(--color-border)"
        />

        {children(geom)}

        {Array.from({ length: count }, (_, i) =>
          renderXTick ? (
            <g key={`tick-${i}`}>{renderXTick(i, cx(i), pad.top + plotH + 4)}</g>
          ) : (
            <text
              key={`tick-${i}`}
              x={cx(i)}
              y={pad.top + plotH + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-ink-soft)"
            >
              {labels?.[i]}
            </text>
          ),
        )}

        {(tooltipRows || renderXTick) &&
          Array.from({ length: count }, (_, i) => (
            <rect
              key={`hover-${i}`}
              x={pad.left + band * i}
              y={pad.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
      </svg>

      {showTooltip && (
        <ChartTooltip
          x={cx(hover)}
          containerWidth={width}
          title={tooltipTitle(hover)}
          rows={tooltipRows(hover)}
        />
      )}
    </div>
  );
}
