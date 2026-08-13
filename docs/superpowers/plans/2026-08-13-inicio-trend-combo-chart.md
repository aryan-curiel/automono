# Inicio Trend Combo Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Inicio's "Facturado vs. gastos" card's custom `<div>` button-list with a real Recharts `ComposedChart` — grouped bars for Facturado/Gastos plus a line for Neto — while preserving the card's existing per-quarter click-to-navigate, declaration-status dot, and RETA pre-alta lock behavior.

**Architecture:** One new presentational component, `src/components/charts/QuarterTrendChart.tsx`, taking a plain data array + labels + a `formatValue`/`onSelectQuarter` callback — same shape as the app's two existing chart components. Its X-axis uses a custom tick renderer (raw SVG, not the Phosphor `Lock` icon component) to reproduce the status-dot/lock/click affordance the old per-row buttons had. `Dashboard.tsx` builds the data array from maps it already computes and swaps the card's JSX.

**Tech Stack:** Tauri 2 + React 19 + TypeScript + `recharts` 3.x (already a dependency) + react-i18next. Package manager: `bun`.

## Global Constraints

- Colors as CSS custom-property strings (`"var(--color-accent)"` etc.), never resolved hex.
- **Gastos uses `info`, not `warn`, in this chart.** The shipped `accent`/`warn` pair (Facturado/Gastos) fails the dataviz skill's colorblind-separation check in both light and dark mode; `accent`/`info` passes. This is scoped to this one chart — `warn` stays correct elsewhere (expenses-by-category, top-category-trend) where it's not adjacent to `accent`.
- Neto's line uses `var(--color-ink)` (achromatic, no CVD pairing question).
- Bars ≤24px thick (`maxBarSize={24}`); gridlines are a single hairline (1px, solid, never dashed); this chart has 3 series so it MUST have a legend (hand-rolled dot/line swatches, not Recharts' built-in `<Legend>`, matching the app's existing legend style).
- Pass `name` directly on each `<Bar>`/`<Line>` (not via the `Tooltip` `formatter`) so hovering shows the correct series label — the pattern already fixed for the other two charts after a prior review found the alternative leaks the raw dataKey.
- No new `src/lib/` functions — `QuarterTrendChart` is presentational; all data prep stays inline in `Dashboard.tsx`.
- Verification is `bunx tsc --noEmit` + `bun run lint` + `bun run build` + `bun run test` passing — no new test files (no component-test harness in this codebase).
- Do not change `onNavigateToQuarter`'s behavior, the RETA lock logic (`altaKey`/`compareQuarterKeys`), or any other Inicio card.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/charts/QuarterTrendChart.tsx` (new) | Grouped-bar + line combo chart with a clickable, status-aware X-axis tick |
| `src/screens/Dashboard.tsx` (modify) | Build `trendData`, swap the trend card's JSX, drop `maxTrendValue` and the now-unused `Lock` import |

---

### Task 1: `QuarterTrendChart` component

**Files:**
- Create: `src/components/charts/QuarterTrendChart.tsx`

**Interfaces:**
- Produces: `QuarterTrendDatum { key: string; label: string; invoiced: number; expenses: number; net: number; status: "completed" | "in_progress" | "none"; locked: boolean }`, `QuarterTrendChartProps { data: QuarterTrendDatum[]; invoicedLabel: string; expensesLabel: string; netLabel: string; formatValue: (value: number) => string; onSelectQuarter: (key: string) => void; height?: number }`, `QuarterTrendChart(props: QuarterTrendChartProps): JSX.Element`. Task 2 consumes these.

- [ ] **Step 1: Create the component**

Create `src/components/charts/QuarterTrendChart.tsx`:

```tsx
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

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={datum.locked ? undefined : () => onSelectQuarter(datum.key)}
      style={{ cursor: datum.locked ? "default" : "pointer" }}
    >
      {datum.locked ? (
        <g transform="translate(-4,8)" fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.2}>
          <rect x={0} y={3} width={8} height={6} rx={1} />
          <path d="M1.5 3 V1.5 a2.5 2.5 0 0 1 5 0 V3" />
        </g>
      ) : (
        <circle cx={0} cy={11} r={2.5} fill={STATUS_DOT_COLOR[datum.status]} />
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
```

A note on the `tick` function: Recharts' `XAxisTickContentProps` types `x`/`y` as
`number | string` (they're occasionally strings internally) — `QuarterTick`'s props
match that rather than narrowing to `number`, and the `translate(${x},${y})` template
literal works with either. If `tsc` still complains about the inline arrow function
passed to `tick`, it's most likely `props.index` needing an explicit type from the
same `XAxisTickContentProps` — check `node_modules/recharts/types/util/types.d.ts`
(`BaseTickContentProps`) rather than casting with `as any`.

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. This component isn't wired into anything yet, so a clean
typecheck here just confirms the file itself is self-consistent — it won't be
visually exercised until Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/QuarterTrendChart.tsx
git commit -m "feat: add QuarterTrendChart combo chart component"
```

---

### Task 2: Wire `QuarterTrendChart` into Inicio's trend card

**Files:**
- Modify: `src/screens/Dashboard.tsx`

**Interfaces:**
- Consumes: `QuarterTrendChart`, `QuarterTrendDatum` from Task 1.

- [ ] **Step 1: Import the new component**

Change:

```ts
import { StackedQuarterBarChart } from "../components/charts/StackedQuarterBarChart";
```

to:

```ts
import { StackedQuarterBarChart } from "../components/charts/StackedQuarterBarChart";
import { QuarterTrendChart } from "../components/charts/QuarterTrendChart";
```

(If the existing import order in the file differs slightly from this anchor, add the new import line immediately after whichever `../components/charts/*` import already exists — keep the two chart imports adjacent.)

- [ ] **Step 2: Drop the `Lock` import**

Change:

```ts
import { TrendUp, Clock, Wallet, Scales, Lock } from "@phosphor-icons/react";
```

to:

```ts
import { TrendUp, Clock, Wallet, Scales } from "@phosphor-icons/react";
```

- [ ] **Step 3: Remove `maxTrendValue`**

Change:

```ts
  const maxTrendValue = Math.max(
    1,
    ...QUARTER_KEYS.flatMap((key) => [
      invoicedByQuarter.get(key) ?? 0,
      expensesByQuarter.get(key) ?? 0,
    ]),
  );

  const currentDeclaration = declarations.find(
```

to:

```ts
  const currentDeclaration = declarations.find(
```

- [ ] **Step 4: Add `trendData`, right after `statusByKey` (needs it)**

Change:

```ts
  const statusByKey = new Map<string, DeclarationStatus>(
    declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]),
  );

  const prevQuarterKey = QUARTER_KEYS[QUARTER_KEYS.length - 2];
```

to:

```ts
  const statusByKey = new Map<string, DeclarationStatus>(
    declarations.map((d) => [`${d.year}-Q${d.quarter}`, d.status]),
  );

  const trendData = QUARTER_KEYS.map((key) => {
    const invoiced = invoicedByQuarter.get(key) ?? 0;
    const expenses = expensesByQuarter.get(key) ?? 0;
    return {
      key,
      label: quarterKeyLabel(key),
      invoiced,
      expenses,
      net: invoiced - expenses,
      status: statusByKey.get(key) ?? "none",
      locked: altaKey !== null && compareQuarterKeys(key, altaKey) < 0,
    };
  });

  const prevQuarterKey = QUARTER_KEYS[QUARTER_KEYS.length - 2];
```

- [ ] **Step 5: Swap the trend card's JSX**

Change:

```tsx
          <div className="font-bold text-sm mb-4">{t("dashboard.trend.title")}</div>
          {QUARTER_KEYS.map((key) => {
            const invoiced = invoicedByQuarter.get(key) ?? 0;
            const expenses = expensesByQuarter.get(key) ?? 0;
            const status = statusByKey.get(key);
            const locked = altaKey !== null && compareQuarterKeys(key, altaKey) < 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onNavigateToQuarter(key)}
                disabled={locked}
                className="w-full text-left px-2 -mx-2 py-2 border-b border-border last:border-b-0
                         rounded-control cursor-pointer hover:bg-surface-alt
                         transition-colors ease-[var(--ease-out)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
                         disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
                  {locked ? (
                    <Lock size={10} weight="bold" className="text-ink-soft shrink-0" />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        status === "completed"
                          ? "bg-success"
                          : status === "in_progress"
                            ? "bg-info"
                            : "bg-ink-soft/40"
                      }`}
                    />
                  )}
                  {quarterKeyLabel(key)}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(invoiced / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(invoiced)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-warn"
                      style={{ width: `${(expenses / maxTrendValue) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] w-20 text-right shrink-0">
                    {formatEUR(expenses)}
                  </span>
                </div>
              </button>
            );
          })}
        </Card>
      </div>
```

to:

```tsx
          <div className="font-bold text-sm mb-4">{t("dashboard.trend.title")}</div>
          <QuarterTrendChart
            data={trendData}
            invoicedLabel={t("dashboard.kpis.invoicedQuarter")}
            expensesLabel={t("dashboard.kpis.expensesQuarter")}
            netLabel={t("dashboard.kpis.netQuarter")}
            formatValue={formatEUR}
            onSelectQuarter={onNavigateToQuarter}
          />
        </Card>
      </div>
```

- [ ] **Step 6: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors. If lint flags `status`/`locked`/`invoiced`/`expenses` as unused
locals anywhere, that means Step 5's old block wasn't fully replaced — check for a
leftover fragment.

- [ ] **Step 7: Manually verify**

Run: `bun run tauri dev`, open Inicio, find the "Facturado vs. gastos" card.
Expected:
- Renders as a real chart: grouped bars (Facturado, Gastos) per quarter plus a
  dark line for Neto, hairline gridlines, a legend below with three entries.
- Hovering a quarter's bars shows a tooltip with all three values (Facturado,
  Gastos, Neto) labeled correctly (not "value" or "invoiced"/"expenses"/"net").
- Each quarter's X-axis tick shows either a colored status dot or (for a
  pre-RETA-alta quarter, if any exist in the data) a small padlock, and clicking
  an unlocked quarter navigates to Resumen Trimestral on that quarter — the same
  behavior the old button-list had.
- If any quarter's Neto is negative, its line dips below a visible zero reference
  line rather than looking like a rendering glitch.

- [ ] **Step 8: Commit**

```bash
git add src/screens/Dashboard.tsx
git commit -m "feat: replace Inicio trend card with a real bars+line combo chart"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full check suite**

Run: `bunx tsc --noEmit && bun run lint && bun run build && bun run test`
Expected: all four pass clean.

- [ ] **Step 2: Numeric spot-check against real data**

If a local dev database exists (e.g. `~/Library/Application Support/com.aryancuriel.automono/automono.db` on macOS), use `sqlite3` (read-only `SELECT`s only) to independently compute one quarter's Facturado (net, via the same basis as `invoicedByQuarter` — non-draft invoices' `subtotal` summed over that quarter's date range), Gastos (deductible expense total for that quarter), and Neto (their difference), and confirm the rendered chart's tooltip values match. If no local dev database is reachable, note that instead of guessing.

- [ ] **Step 3: Verify nothing else regressed**

Confirm every other Inicio card (hero, KPI row, the three other analytics charts,
recurring, recent invoices, upcoming due, revenue-by-client, expenses-by-category)
still renders unchanged, and that clicking a quarter in the new chart still lands
on `ResumenTrimestral` at that specific quarter (not the current one) — the same
`onNavigateToQuarter` → `dashboardQuarterKey` → `initialQuarterKey` wiring in
`App.tsx` this plan didn't touch.

- [ ] **Step 4: Final commit (if any fixups were needed)**

If Steps 1-3 surfaced an issue requiring a code change, fix it, re-run the relevant
check, then:

```bash
git add -A
git commit -m "fix: address issues found in trend combo chart manual verification"
```

If no fixups were needed, no commit here.
