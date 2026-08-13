# Inicio trend card — combo chart (bars + net line)

## Problem

The "Facturado vs. gastos" card is the last Inicio analytics card still rendering as
custom `<div>` progress bars instead of a real chart, and it doesn't show Net
(income − expenses) at all, only the two raw inputs. It's also the app's only
remaining interactive per-quarter control (click a quarter → navigate to Resumen
Trimestral, with a declaration-status dot and a RETA pre-alta lock icon) — any
replacement has to keep that.

## Design

Replace the card's body with a Recharts `ComposedChart`: grouped bars for Facturado
and Gastos (two independent, directly comparable magnitudes) plus a line for Neto
(a derived summary — a line reads trend direction better than a third competing bar,
and crosses a zero baseline cleanly if a quarter runs net-negative). Single shared
€ axis, no dual-axis.

### Color decision

The shipped chart pairs `accent` (Facturado) with `warn` (Gastos) — validated with
the dataviz skill's palette checker, this pair **fails** colorblind-separation in
both light and dark mode (a pre-existing issue, not introduced here). `accent`/`info`
passes cleanly, so **Gastos moves from `warn` to `info` for this chart only** — its
other appearances (expenses-by-category, top-category-trend) are single-series
charts where `warn` alone is fine; the clash only exists when Facturado and Gastos
are compared side by side. Neto's line uses `var(--color-ink)` — an achromatic
neutral needs no CVD check against the two hues, and reads as "the bottom line"
distinct from the two colored inputs by weight/form, not by competing for a third hue.

### New component: `src/components/charts/QuarterTrendChart.tsx`

```ts
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
```

Grouped bars (`invoiced` fill `var(--color-accent)`, `expenses` fill
`var(--color-info)`, no `stackId` so Recharts groups them side by side, each
`radius={[4,4,0,0]}` `maxBarSize={24}`), a `Line` for `net` (`stroke:
var(--color-ink)`, `strokeWidth={2}`, `dot={{ r: 4 }}`), a `ReferenceLine` at
`y={0}` when any `net` value is negative, hairline solid gridlines, a shared
tooltip (Recharts' default behavior for a `ComposedChart` — hovering a quarter
shows all three values together, which is the right read here since they're the
same quarter's numbers, not independent series to compare across quarters), and a
hand-rolled legend (three entries — two dot swatches for the bars, a short line
swatch for Neto — legend is mandatory at 3 series per the dataviz skill).

**Custom interactive X-axis tick** replaces the plain quarter label to preserve the
existing click-to-navigate/status-dot/lock behavior: a function passed to
`<XAxis tick={...}>` receives `{ x, y, index }`, looks up `data[index]` for the
full per-quarter datum, and renders (as raw SVG inside a `<g transform="translate(x,y)">`,
not the Phosphor `Lock` icon component — nesting a full icon component's own `<svg>`
inside a Recharts-rendered tick is an unnecessary risk for a detail this small):
a colored `<circle>` (status dot: `success`/`info`/muted per declaration status) or,
when `locked`, a small hand-drawn padlock (`<rect>` + `<path>` arc, ~8×8, in
`var(--color-ink-soft)`) instead of the dot, then the quarter label as `<text>`
below it. The whole `<g>` gets `onClick={locked ? undefined : () => onSelectQuarter(key)}`
and `cursor: pointer`/`cursor: default` accordingly.

### `Dashboard.tsx` changes

- Build `trendData: QuarterTrendDatum[]` from `QUARTER_KEYS`, `invoicedByQuarter`,
  `expensesByQuarter`, `statusByKey`, `altaKey`/`compareQuarterKeys` — all already
  computed in this file. `net = invoiced - expenses`.
- Swap the card's `{QUARTER_KEYS.map(...)}` button-list body for
  `<QuarterTrendChart data={trendData} invoicedLabel={t("dashboard.kpis.invoicedQuarter")} expensesLabel={t("dashboard.kpis.expensesQuarter")} netLabel={t("dashboard.kpis.netQuarter")} formatValue={formatEUR} onSelectQuarter={onNavigateToQuarter} />`
  — reuses the KPI row's existing i18n keys instead of adding new ones.
- Remove `maxTrendValue` (Recharts scales its own axis) and the `Lock` icon import
  from `@phosphor-icons/react` (no longer used in `Dashboard.tsx` once the tick's
  padlock is hand-drawn SVG inside the new component instead).

## Out of scope

- No changes to any other Inicio card.
- No changes to `onNavigateToQuarter`'s behavior or the RETA lock's underlying logic
  (`altaKey`/`compareQuarterKeys`) — only how the quarter axis is rendered.
- Pixel-level spacing inside the custom tick (dot/lock/label vertical rhythm) is a
  best-effort layout, not visually verified in this environment (no display) —
  flagged for a manual check via `bun run tauri dev`.
