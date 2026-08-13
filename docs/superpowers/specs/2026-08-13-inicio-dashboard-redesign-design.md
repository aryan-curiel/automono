# Inicio (Dashboard) redesign

## Problem

`Dashboard.tsx` (Inicio) predates the quarterly declarations feature
(`db/declarations.ts`, `QuarterTimeline`, the Resumen Trimestral rewrite). It
already shows KPIs, recent invoices, upcoming due, aging, a generic tax
calendar, revenue-by-client and expenses-by-category — but has no idea a
declaration exists, is in progress, or is missing filed Modelo PDFs. The
single biggest gap: opening the app tells you nothing about where you stand
with the current quarter's taxes, which is the thing this user cares about
most.

## Design

Read-only + deep-link: the dashboard surfaces status, every card that
represents an action navigates to the screen that owns it (`resumen-trimestral`,
`facturas`, `gastos`). No new inline actions beyond the existing "generate
recurring invoice" button.

### New data fetched by `Dashboard`

- `listDeclarations()` (from `db/declarations.ts`) — one call, reused by the
  hero card, the historical timeline, and the tax-calendar status dots. Same
  function `ResumenTrimestral` already uses.
- `listExpenses({ from, to, quarterKeys })` widened to cover the last 6
  quarters (replaces today's single-current-quarter fetch). Bucketed
  client-side by quarter for the trend chart; filtered to the current quarter
  for the existing expenses-by-category card. One fetch feeds both — no
  duplicate query.

### Section 1 — Declaration status hero (new, top of page, below `PageHeader`)

A full-width `Card`:

- Current quarter label (`quarterKeyLabel` from `lib/dateRange.ts`) + a status
  `Badge`: *Sin empezar* (no matching row in `listDeclarations()`) / *En
  progreso* / *Completada*.
- If a declaration row exists for the current quarter: three small indicators
  for modelo 303/130/111 — attached (`modeloXPath` set) vs. missing — reusing
  the same check-vs-pending visual language `ResumenTrimestral` uses for its
  modelo grid, not a new component.
- Invoiced total / deductible expenses total for the quarter — reuses the
  `totalFacturado` / `expensesThisQuarter` values Dashboard already computes
  (no new math).
- Next filing deadline (`nextTaxDeadlines(todayIso, 1)`), with `warn` tone if
  within 14 days.
- One `Button`: "Ir a Resumen Trimestral" → `onNavigate("resumen-trimestral")`.

### Section 2 — Historical timeline + trend chart (new, below the KPI row)

Two-column grid, `[1fr_1fr]`:

- **Left card — `DashboardQuarterStrip`** (new, local to `Dashboard.tsx`, not
  extracted to `components/` — nothing else uses it): a fixed, non-paginated
  row of the last 6 quarter keys ending at the current quarter. Same dot-status
  visual (success/info/muted, from `QuarterTimeline`'s existing color logic)
  but no arrows, no `Lock`/disabled-window logic — it's a static window, not a
  focus-and-page control. Each quarter button `onClick` →
  `onNavigate("resumen-trimestral")` after calling a new
  `onNavigateToQuarter(key)` callback (see prop threading below).
- **Right card — quarter trend**: grouped bars, one pair (invoiced /
  expenses) per quarter for the same 6 quarters, same bar-and-label markup
  already used by the revenue-by-client / expenses-by-category cards further
  down (`h-1.5 rounded-full bg-surface-alt` track, `bg-accent` / `bg-warn`
  fill) — no new chart primitive.

### `ResumenTrimestral` gets an optional `initialQuarterKey` prop

So clicking a past quarter in the new strip actually lands there instead of
always resetting to the current quarter:

```ts
interface ResumenTrimestralProps {
  invoices: InvoiceListItem[];
  dropPaths?: string[] | null;
  dropToken?: number;
  initialQuarterKey?: string;
}
```

```ts
const [focusedKey, setFocusedKey] = useState(initialQuarterKey ?? CURRENT_KEY);
```

`App.tsx` gets a small `dashboardQuarterKey` state (`string | null`), set by
`Dashboard`'s new `onNavigateToQuarter` callback right before navigating, read
by `ResumenTrimestral`'s `initialQuarterKey` prop, cleared on any other
navigation into `resumen-trimestral` (e.g. the sidebar) so it doesn't leak
into unrelated visits.

### Section 3 — existing sections, kept, one enhanced

Everything below stays as today, just now sitting under the two new sections:
KPI row, recurring invoices card, recent invoices + upcoming due grid, aging +
tax calendar grid, revenue-by-client + expenses-by-category grid.

One enhancement: the tax-calendar card's quarterly deadline rows (model
`"130/303"`) get a small status dot next to the date, reusing the same
`listDeclarations()` data already fetched for the hero/strip — a quick visual
of whether that upcoming deadline's declaration has been started. The annual
deadline (`"190/390"`) has no declaration-row analog in this system and gets
no dot.

## Out of scope

- No inline actions on the dashboard (attaching a modelo PDF, marking a
  declaration complete) — those stay in `ResumenTrimestral`.
- No changes to `QuarterTimeline` itself — the dashboard's strip is a
  separate, simpler component (fixed window, no pagination/lock logic), not a
  reuse-by-prop of the existing one.
- No new lib functions for the trend chart — bucketing by quarter is done
  inline in `Dashboard.tsx` with existing `dateRange.ts` helpers
  (`quarterKeyOf`, `quartersInRange`).
- Historical window is fixed at 6 quarters, not configurable.
