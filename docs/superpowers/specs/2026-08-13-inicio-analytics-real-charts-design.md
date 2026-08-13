# Inicio analytics cards — real charts

## Problem

The four "Análisis" cards added to Inicio (`docs/superpowers/specs/2026-08-13-inicio-analytics-cards-design.md`) render as custom `<div>` progress bars scaled to a per-card max, not axis-based charts. The user asked for real charts.

## Design

Add `recharts` (React 19-compatible, SVG-based, ships tooltips/axes/legend) as the app's first charting dependency. Two new reusable components under `src/components/charts/` (parallel to the existing `src/components/ui/` folder), consumed by `Dashboard.tsx`. No other screen currently needs charts; nothing else changes.

### Color decisions (validated with the dataviz skill's `validate_palette.js`)

- **Cobrado vs. pendiente** switches its "pending" color from `warn` (amber) to `info` (blue). The shipped `success`/`warn` pair fails the colorblind-separation check (ΔE 12.2, below the 15 floor). `success`/`info` passes every check in light mode; dark mode has a minor lightness-band-only miss (contrast and CVD both still pass) — accepted as-is rather than inventing chart-only color variants, since `success`/`info` is already the app's existing `invoiceStatusMeta` mapping for paid/issued invoices (`src/lib/status.ts`), so this is also a consistency fix, not just a palette swap.
- **IVA a liquidar** stays single-hue (`accent`). Credit quarters (negative net) render as a bar below a zero `ReferenceLine` instead of switching color — position conveys the sign, so no second hue, no CVD pairing question. This also means the current text-only "IVA a tu favor" branch goes away; the bar chart shows it directly, with the tooltip appending an "(a tu favor)" qualifier.
- **Mayor categoría de gasto** stays single-hue (`warn`, matching the existing expenses-by-category card elsewhere on the page).
- **Composición de ingresos** is not a chart. Per the dataviz form-selection table, "a single ratio against a limit" is meter territory, not axes-and-bars — restyled as an upgraded meter (rounded track, rounded fill end, unchanged `accent` hue), same underlying data.

All chart colors are passed as CSS custom-property strings (`var(--color-accent)`, etc.) directly to Recharts' `fill`/`stroke` props, not resolved to hex in JS — this makes charts repaint automatically when the app's `.dark` class toggles, with no theme prop threading.

### `src/components/charts/QuarterBarChart.tsx` (new)

Single-series bar chart, one bar per quarter. Used by the IVA and top-category cards.

```ts
export interface QuarterBarDatum {
  key: string;
  label: string;
  value: number;
}

export interface QuarterBarChartProps {
  data: QuarterBarDatum[];
  color: string; // CSS color, e.g. "var(--color-accent)"
  formatValue: (value: number) => string;
  formatTooltipLabel?: (value: number) => string; // defaults to formatValue
  height?: number; // default 160
}

export function QuarterBarChart(props: QuarterBarChartProps): JSX.Element
```

Built on Recharts' `ResponsiveContainer` > `BarChart`: `CartesianGrid` (horizontal only, `stroke="var(--color-border)"`, dashed), `XAxis` on `label` (no axis line noise — tick labels + `var(--color-ink-soft)`), `YAxis` with `tickFormatter={formatValue}`, a `ReferenceLine` at `y={0}` only when any datum is negative, a `Tooltip` styled with the app's surface/border tokens, and one `Bar` with `radius={[4, 4, 4, 4]}` and `maxBarSize` so bars stay thin on a 4-point quarter axis (per the dataviz mark spec: thin marks, 4px rounded data-ends).

### `src/components/charts/StackedQuarterBarChart.tsx` (new)

Two-series stacked bar chart. Used only by the paid-vs-outstanding card.

```ts
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
  height?: number; // default 160
}

export function StackedQuarterBarChart(props: StackedQuarterBarChartProps): JSX.Element
```

Same axis/grid/tooltip treatment as `QuarterBarChart`, plus two `Bar`s sharing `stackId="1"` (`a` first/bottom, `b` on top) and a Recharts `Legend` below the plot using `aLabel`/`bLabel`, restyled to match the app's existing small-caption legend look (the current `<span>` + colored dot pattern) rather than Recharts' default legend chrome.

### `Dashboard.tsx` changes

- Import both new chart components and `formatEUR` stays as the value formatter (already imported).
- IVA card: build `QuarterBarDatum[]` from `ivaNetByQuarter`/`QUARTER_KEYS`, render `<QuarterBarChart data={...} color="var(--color-accent)" formatValue={formatEUR} formatTooltipLabel={(v) => v < 0 ? \`${formatEUR(Math.abs(v))} ${t("dashboard.analytics.ivaTrend.creditSuffix")}\` : formatEUR(v)} />`. Drop `maxIvaNetValue` (Recharts scales its own axis) and the old `ivaTrend.credit`/per-row-bar JSX. Card keeps its existing subtitle line below the chart.
- Paid/pending card: build `StackedQuarterBarDatum[]` from `grossInvoicedByQuarter`/`paidByQuarter`/`QUARTER_KEYS` (`a` = paid, `b` = pending = `max(0, total - paid)`), render `<StackedQuarterBarChart ... aColor="var(--color-success)" bColor="var(--color-info)" />`. Drop the old per-row stacked-div JSX and the now-unused hand-rolled legend (the chart component owns its own legend).
- Top-category card: same `QuarterBarChart` treatment as IVA, `color="var(--color-warn)"`, no reference line (values are never negative). Drop `maxCategoryTrendValue`.
- Composition card: restyle the two existing bar rows as meters — track becomes `h-2 rounded-full bg-surface-alt`, fill keeps `bg-accent` with `rounded-full`, add a small `100%` tick label at the track's right edge. No data changes.
- i18n: `dashboard.analytics.paidVsOutstanding.paid`/`.pending` keys are reused as-is for the new chart's legend labels. `dashboard.analytics.ivaTrend.credit` (which took a `{{amount}}` param and produced a full sentence) is replaced by a shorter `dashboard.analytics.ivaTrend.creditSuffix` (just the qualifier word/phrase, composed with `formatEUR` in the tooltip formatter) in both locale files.

## Out of scope

- No "view as table" accessibility fallback per card — disproportionate for a 4-card section in a single-user desktop app.
- No changes to any other screen or to the underlying per-quarter data derivations already in `Dashboard.tsx` (`ivaNetByQuarter`, `paidByQuarter`, `grossInvoicedByQuarter`, `categoryTrendByQuarter`, `topClientShare`, `repeatClientShare`) — only their consumption in JSX changes.
- No animation/transition tuning beyond Recharts' defaults.
