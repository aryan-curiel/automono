# Inicio Analytics Real Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `<div>` progress-bar rendering in Inicio's four "Análisis" cards with real Recharts-based axis charts (two new reusable chart components), and restyle the one card that's correctly a meter (not a chart) rather than forcing it into a chart shape.

**Architecture:** `recharts` becomes the app's first charting dependency. Two new components under `src/components/charts/` (`QuarterBarChart` for single-series cards, `StackedQuarterBarChart` for the two-series paid/pending card), each taking plain data arrays + formatters — no knowledge of `Dashboard.tsx`'s internals. `Dashboard.tsx` builds the small array-of-objects each chart needs from data it already derives (`ivaNetByQuarter`, `categoryTrendByQuarter`, `grossInvoicedByQuarter`/`paidByQuarter`) and drops the now-unused `maxIvaNetValue`/`maxCategoryTrendValue` scaling consts (Recharts scales its own axis).

**Tech Stack:** Tauri 2 + React 19 + TypeScript + `recharts` 3.x + react-i18next. Package manager: `bun`.

## Global Constraints

- Colors are passed to Recharts as CSS custom-property strings (`"var(--color-accent)"`, etc.), never resolved to hex — this makes charts repaint automatically on the app's `.dark` class toggle.
- **Paid-vs-outstanding uses `success`/`info`, not `success`/`warn`.** The shipped `success`/`warn` pair fails the dataviz skill's colorblind-separation check; `success`/`info` passes and also matches this app's existing `invoiceStatusMeta` mapping (`src/lib/status.ts`: paid→success, issued→info).
- Per the dataviz skill's mark spec: bars ≤24px thick (`maxBarSize={24}`), gridlines are a single hairline (1px, **solid, never dashed**) in `var(--color-border)`, single-series charts get no legend box (the card title already names the series), two-series charts always get a legend.
- No new `src/lib/` functions — the two new files are presentational chart components in `src/components/charts/`, not data-derivation helpers.
- This codebase has no component-level test harness — verification is `bunx tsc --noEmit` + `bun run lint` + `bun run build` passing, and (per Task 3) a numeric spot-check against the real dev database, not new test files.
- Do not change any per-quarter derivation logic already in `Dashboard.tsx` (`ivaNetByQuarter`, `grossInvoicedByQuarter`, `paidByQuarter`, `categoryTrendByQuarter`, `topClientShare`, `repeatClientShare`) — only how it's rendered.

---

## File Structure

| File                                                                | Responsibility                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/charts/QuarterBarChart.tsx` (new)                   | Single-series column chart for a fixed quarter axis — used by the IVA and top-category cards                                                      |
| `src/components/charts/StackedQuarterBarChart.tsx` (new)            | Two-series stacked column chart + legend — used by the paid-vs-outstanding card                                                                   |
| `src/screens/Dashboard.tsx` (modify)                                | Build chart-ready data arrays, swap the old bar-list JSX for the two new components, restyle the composition-card meters                          |
| `src/locales/es/common.json`, `src/locales/en/common.json` (modify) | `dashboard.analytics.ivaTrend.credit` (a full sentence) → `.creditSuffix` (a short qualifier, composed with `formatEUR` in the tooltip formatter) |
| `package.json`, `bun.lock` (modify)                                 | Add `recharts` dependency                                                                                                                         |

---

### Task 1: `QuarterBarChart` component + IVA card + top-category card

**Files:**

- Create: `src/components/charts/QuarterBarChart.tsx`
- Modify: `src/screens/Dashboard.tsx` (import, two new data-array consts replacing two deleted max consts, two JSX swaps)
- Modify: `package.json`, `bun.lock` (via `bun add recharts`)

**Interfaces:**

- Produces: `QuarterBarDatum { key: string; label: string; value: number }`, `QuarterBarChartProps { data: QuarterBarDatum[]; color: string; formatValue: (value: number) => string; formatTooltipValue?: (value: number) => string; height?: number }`, `QuarterBarChart(props: QuarterBarChartProps): JSX.Element`. Task 2 does not consume these — it builds its own equivalent shape for the stacked chart.

- [ ] **Step 1: Install recharts**

Run: `bun add recharts`
Expected: `package.json` gains a `"recharts": "^3...."` dependency; `bun.lock` updates.

- [ ] **Step 2: Create `QuarterBarChart.tsx`**

Create `src/components/charts/QuarterBarChart.tsx`:

```tsx
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
```

- [ ] **Step 3: Add the i18n key rename**

In `src/locales/es/common.json`, change:

```json
      "ivaTrend": {
        "title": "IVA a liquidar por trimestre",
        "credit": "IVA a tu favor: {{amount}}",
        "subtitle": "Proyección: incluye facturas emitidas sin cobrar"
      },
```

to:

```json
      "ivaTrend": {
        "title": "IVA a liquidar por trimestre",
        "creditSuffix": "a tu favor",
        "subtitle": "Proyección: incluye facturas emitidas sin cobrar"
      },
```

In `src/locales/en/common.json`, change:

```json
      "ivaTrend": {
        "title": "VAT due per quarter",
        "credit": "VAT credit: {{amount}}",
        "subtitle": "Projection: includes issued unpaid invoices"
      },
```

to:

```json
      "ivaTrend": {
        "title": "VAT due per quarter",
        "creditSuffix": "credit",
        "subtitle": "Projection: includes issued unpaid invoices"
      },
```

- [ ] **Step 4: Import the new component in `Dashboard.tsx`**

In `src/screens/Dashboard.tsx`, change:

```ts
import { agingReport, expenseByCategory, revenueByClient } from "../lib/analytics";
```

to:

```ts
import { agingReport, expenseByCategory, revenueByClient } from "../lib/analytics";
import { QuarterBarChart } from "../components/charts/QuarterBarChart";
```

- [ ] **Step 5: Replace `maxIvaNetValue` with the chart data array**

Change:

```ts
const maxIvaNetValue = Math.max(
  1,
  ...QUARTER_KEYS.map((key) => Math.max(0, ivaNetByQuarter.get(key) ?? 0)),
);
```

to:

```ts
const ivaTrendData = QUARTER_KEYS.map((key) => ({
  key,
  label: quarterKeyLabel(key),
  value: ivaNetByQuarter.get(key) ?? 0,
}));
```

- [ ] **Step 6: Replace `maxCategoryTrendValue` with the chart data array**

Change:

```ts
const maxCategoryTrendValue = Math.max(
  1,
  ...QUARTER_KEYS.map((key) => categoryTrendByQuarter.get(key) ?? 0),
);
```

to:

```ts
const categoryTrendData = QUARTER_KEYS.map((key) => ({
  key,
  label: quarterKeyLabel(key),
  value: categoryTrendByQuarter.get(key) ?? 0,
}));
```

- [ ] **Step 7: Swap the IVA card's JSX**

Change:

```tsx
<Card className="p-6">
  <div className="font-bold text-sm mb-4">{t("dashboard.analytics.ivaTrend.title")}</div>
  {QUARTER_KEYS.map((key) => {
    const net = ivaNetByQuarter.get(key) ?? 0;
    return (
      <div key={key} className="py-2 border-b border-border last:border-b-0">
        <div className="text-xs font-medium mb-1.5">{quarterKeyLabel(key)}</div>
        {net < 0 ? (
          <div className="text-xs text-success">
            {t("dashboard.analytics.ivaTrend.credit", { amount: formatEUR(Math.abs(net)) })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(net / maxIvaNetValue) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[11px] w-20 text-right shrink-0">{formatEUR(net)}</span>
          </div>
        )}
      </div>
    );
  })}
  <div className="text-[11px] text-ink-soft mt-3">{t("dashboard.analytics.ivaTrend.subtitle")}</div>
</Card>
```

to:

```tsx
<Card className="p-6">
  <div className="font-bold text-sm mb-4">{t("dashboard.analytics.ivaTrend.title")}</div>
  <QuarterBarChart
    data={ivaTrendData}
    color="var(--color-accent)"
    formatValue={formatEUR}
    formatTooltipValue={(value) =>
      value < 0
        ? `${formatEUR(Math.abs(value))} ${t("dashboard.analytics.ivaTrend.creditSuffix")}`
        : formatEUR(value)
    }
  />
  <div className="text-[11px] text-ink-soft mt-3">{t("dashboard.analytics.ivaTrend.subtitle")}</div>
</Card>
```

- [ ] **Step 8: Swap the top-category card's JSX**

Change:

```tsx
{
  !topExpenseCategory ? (
    <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
  ) : (
    QUARTER_KEYS.map((key) => {
      const amount = categoryTrendByQuarter.get(key) ?? 0;
      return (
        <div key={key} className="py-2 border-b border-border last:border-b-0">
          <div className="text-xs font-medium mb-1.5">{quarterKeyLabel(key)}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
              <div
                className="h-full rounded-full bg-warn"
                style={{ width: `${(amount / maxCategoryTrendValue) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[11px] w-20 text-right shrink-0">
              {formatEUR(amount)}
            </span>
          </div>
        </div>
      );
    })
  );
}
```

to:

```tsx
{
  !topExpenseCategory ? (
    <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
  ) : (
    <QuarterBarChart data={categoryTrendData} color="var(--color-warn)" formatValue={formatEUR} />
  );
}
```

- [ ] **Step 9: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. (`quarterKeyLabel` stays used elsewhere in the file; if lint flags anything newly unused, check whether it's `net`/`amount` locals that no longer exist post-swap — they were removed along with the old `.map()` blocks, so there should be nothing dangling.)

- [ ] **Step 10: Manually verify**

Run: `bun run tauri dev`, open Inicio, scroll to "Análisis".
Expected:

- "IVA a liquidar por trimestre" renders as a real bar chart: X-axis quarter labels, Y-axis € values, hairline gridlines, hover tooltip per bar. A credit (negative) quarter, if any, shows its bar below a zero line and the tooltip reads "…€ a tu favor" (or "credit" in English).
- "Mayor categoría de gasto: <category>" renders the same chart shape in the `warn` (amber) color.
- Both charts resize with the window (no horizontal scrollbar, no overflow).

- [ ] **Step 11: Commit**

```bash
git add package.json bun.lock src/components/charts/QuarterBarChart.tsx src/screens/Dashboard.tsx src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: replace IVA and top-category cards' bars with real Recharts column charts"
```

---

### Task 2: `StackedQuarterBarChart` component + paid/pending card + composition-card meter polish

**Files:**

- Create: `src/components/charts/StackedQuarterBarChart.tsx`
- Modify: `src/screens/Dashboard.tsx` (import, one new data-array const, one JSX swap, two meter-track class tweaks)

**Interfaces:**

- Produces: `StackedQuarterBarDatum { key: string; label: string; a: number; b: number }`, `StackedQuarterBarChartProps { data: StackedQuarterBarDatum[]; aColor: string; bColor: string; aLabel: string; bLabel: string; formatValue: (value: number) => string; height?: number }`, `StackedQuarterBarChart(props: StackedQuarterBarChartProps): JSX.Element`.

- [ ] **Step 1: Create `StackedQuarterBarChart.tsx`**

Create `src/components/charts/StackedQuarterBarChart.tsx`:

```tsx
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
            width={56}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-alt)" }}
            formatter={(value, name) => [
              formatValue(Number(value)),
              name === "a" ? aLabel : bLabel,
            ]}
            labelStyle={{ color: "var(--color-ink)", fontWeight: 600, marginBottom: 4 }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="a" stackId="quarter" fill={aColor} maxBarSize={24} />
          <Bar dataKey="b" stackId="quarter" fill={bColor} radius={[4, 4, 0, 0]} maxBarSize={24} />
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
```

- [ ] **Step 2: Import the new component in `Dashboard.tsx`**

Change:

```ts
import { QuarterBarChart } from "../components/charts/QuarterBarChart";
```

to:

```ts
import { QuarterBarChart } from "../components/charts/QuarterBarChart";
import { StackedQuarterBarChart } from "../components/charts/StackedQuarterBarChart";
```

- [ ] **Step 3: Add the paid/pending chart data array**

Change:

```ts
const paidByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);

const clientInvoiceCountThisYear = new Map<number, number>();
```

to:

```ts
const paidByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);
const paidPendingData = QUARTER_KEYS.map((key) => {
  const total = grossInvoicedByQuarter.get(key) ?? 0;
  const paid = paidByQuarter.get(key) ?? 0;
  return {
    key,
    label: quarterKeyLabel(key),
    a: paid,
    b: Math.max(0, total - paid),
  };
});

const clientInvoiceCountThisYear = new Map<number, number>();
```

- [ ] **Step 4: Swap the paid/pending card's JSX**

Change:

```tsx
{
  QUARTER_KEYS.map((key) => {
    const total = grossInvoicedByQuarter.get(key) ?? 0;
    const paid = paidByQuarter.get(key) ?? 0;
    const pending = Math.max(0, total - paid);
    const paidPct = total > 0 ? (paid / total) * 100 : 0;
    const pendingPct = total > 0 ? (pending / total) * 100 : 0;
    return (
      <div key={key} className="py-2 border-b border-border last:border-b-0">
        <div className="text-xs font-medium mb-1.5">{quarterKeyLabel(key)}</div>
        <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden flex">
          <div className="h-full bg-success" style={{ width: `${paidPct}%` }} />
          <div className="h-full bg-warn" style={{ width: `${pendingPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px] font-mono">
          <span className="text-success">{formatEUR(paid)}</span>
          <span className="text-warn">{formatEUR(pending)}</span>
        </div>
      </div>
    );
  });
}
<div className="flex items-center gap-4 mt-3 text-[11px] text-ink-soft">
  <span className="flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full bg-success" />
    {t("dashboard.analytics.paidVsOutstanding.paid")}
  </span>
  <span className="flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full bg-warn" />
    {t("dashboard.analytics.paidVsOutstanding.pending")}
  </span>
</div>;
```

to:

```tsx
<StackedQuarterBarChart
  data={paidPendingData}
  aColor="var(--color-success)"
  bColor="var(--color-info)"
  aLabel={t("dashboard.analytics.paidVsOutstanding.paid")}
  bLabel={t("dashboard.analytics.paidVsOutstanding.pending")}
  formatValue={formatEUR}
/>
```

- [ ] **Step 5: Polish the composition card's meters**

Change (both occurrences in the composition card — the top-client meter and the repeat-clients meter):

```tsx
<div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
  <div className="h-full rounded-full bg-accent" style={{ width: `${topClientShare * 100}%` }} />
</div>
```

to:

```tsx
<div className="h-2 rounded-full bg-surface-alt overflow-hidden">
  <div className="h-full rounded-full bg-accent" style={{ width: `${topClientShare * 100}%` }} />
</div>
```

and:

```tsx
<div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
  <div className="h-full rounded-full bg-accent" style={{ width: `${repeatClientShare * 100}%` }} />
</div>
```

to:

```tsx
<div className="h-2 rounded-full bg-surface-alt overflow-hidden">
  <div className="h-full rounded-full bg-accent" style={{ width: `${repeatClientShare * 100}%` }} />
</div>
```

(Both meters already have a fully rounded track and fill end — the only change here is the track thickness, `h-1.5` → `h-2`, for a slightly more meter-like, less progress-bar-like weight. Do not touch the surrounding label/percentage markup.)

- [ ] **Step 6: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 7: Manually verify**

Run: `bun run tauri dev`, open Inicio, scroll to "Análisis".
Expected:

- "Cobrado vs. pendiente" renders as a stacked column chart: green (paid) segment at the bottom of each bar, blue (pending) segment on top, hairline gridlines, hover tooltip shows both segment values, legend below the chart reads "Cobrado" / "Pendiente" with matching colored dots.
- Composition card's two meters are visibly slightly thicker than before; no other visual change there.

- [ ] **Step 8: Commit**

```bash
git add src/components/charts/StackedQuarterBarChart.tsx src/screens/Dashboard.tsx
git commit -m "feat: replace paid-vs-outstanding bars with a real stacked chart, polish composition meters"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full check suite**

Run: `bunx tsc --noEmit && bun run lint && bun run build && bun run test`
Expected: all four pass clean.

- [ ] **Step 2: Numeric spot-check against real data**

If a local dev database exists (e.g. `~/Library/Application Support/com.aryancuriel.automono/automono.db` on macOS), use `sqlite3` (read-only `SELECT`s only) to independently compute one quarter's IVA net, paid/pending split, and top expense category, and confirm the rendered chart's tooltip values match. If no local dev database is reachable from this environment, note that in the report instead of guessing.

- [ ] **Step 3: Visual/theme check**

Run `bun run tauri dev`. Confirm:

- All three charts (IVA, paid/pending, top-category) render with correct axis labels, tooltips on hover, and no layout overflow at the app's default window width.
- Toggle light/dark in Ajustes — bars, gridlines, and tooltip backgrounds all repaint correctly in both themes (this is the payoff of using `var(--color-*)` fills instead of hex).
- The IVA chart's negative-quarter case (if any exists in the data) renders below the zero line with the correct tooltip suffix.

- [ ] **Step 4: Verify nothing else regressed**

Confirm every other Inicio card (hero, KPIs, comparison/trend, recurring, recent invoices, upcoming due, aging, tax calendar, revenue-by-client, expenses-by-category) still renders unchanged.

- [ ] **Step 5: Final commit (if any fixups were needed)**

If Steps 1-4 surfaced an issue requiring a code change, fix it, re-run the relevant check, then:

```bash
git add -A
git commit -m "fix: address issues found in real-charts manual verification"
```

If no fixups were needed, no commit here.
