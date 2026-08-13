# Inicio analytics cards

## Problem

`Dashboard.tsx` (Inicio) shows current-quarter status (hero card, KPIs), a
quarter-over-quarter comparison, and a 4-quarter invoiced/expenses trend, but
nothing about what tax you actually owe (IVA net of deductible input IVA),
whether invoiced revenue is turning into cash, or how concentrated/stable
that revenue is. All of that data is already fetched by `Dashboard` — it's
just not surfaced.

## Design

A new "Análisis" section at the bottom of Inicio, below the existing revenue
by client / expenses by category grid, behind a section-header divider (same
visual weight as the `font-bold text-sm` card titles used elsewhere, just
outside a `Card`). Two-column grid, four cards. No new DB queries — everything
is derived from `invoices`, `recentExpenses`, and the `QUARTER_KEYS` /
`invoicedByQuarter` / `expensesByQuarter` machinery `Dashboard` already builds.
No new `src/lib/` functions, matching this file's existing convention of
inline per-quarter bucketing (see the plan for the original dashboard
redesign: "No new lib functions for the trend chart").

### Card 1 — IVA a liquidar por trimestre

One row per `QUARTER_KEYS` entry (oldest → newest, same as the existing trend
card), single bar:

```
ivaInvoicedByQuarter[key] = Σ invoicesInPeriod(invoices, quarterKeyRange(key))
                               .filter(inv => inv.status !== "draft")
                               .map(inv => inv.ivaAmount ?? 0)

ivaDeductibleByQuarter[key] = Σ recentExpenses
                                 .filter(e => expenseQuarterKey(e) === key)
                                 .map(e => (e.ivaAmount ?? 0) * (e.deductiblePct / 100))

ivaNetByQuarter[key] = ivaInvoicedByQuarter[key] - ivaDeductibleByQuarter[key]
```

Rendered with the same `h-1.5 rounded-full bg-surface-alt` track / `bg-accent`
fill row markup as the existing trend card. When `ivaNetByQuarter[key] < 0`
(deductible IVA exceeded invoiced IVA that quarter — e.g. a big equipment
purchase), render no fill and the amount in `text-success` instead of
`font-mono` neutral, since a negative here is IVA in the user's favor, not a
problem.

Not charted: IRPF. Invoice-side IRPF retention (withheld by clients, prepays
the freelancer's own annual income tax) and expense-side IRPF (Modelo 111,
withheld from subcontractors) are different filings with different meaning —
blending them into one number would misstate what's owed. Out of scope here;
can be added as its own card later if needed.

### Card 2 — Cobrado vs. pendiente por trimestre

One row per quarter, a single **stacked** two-color bar (new markup — two
`<div>` fills inside one `bg-surface-alt` track instead of the existing
pattern's two separate tracks):

```
quarterInvoices = invoicesInPeriod(invoices, quarterKeyRange(key)).filter(inv => inv.status !== "draft")
paid = Σ quarterInvoices.filter(inv => inv.status === "paid").map(inv => inv.total)
unpaid = Σ quarterInvoices.filter(inv => inv.status === "issued").map(inv => inv.total)
total = paid + unpaid  // guard: skip the bar (0-width track only) when total === 0
```

`bg-success` fill for `paid` width `${(paid/total)*100}%`, `bg-warn` fill for
`unpaid` immediately after it. Amount labels: `formatEUR(paid)` /
`formatEUR(unpaid)` stacked to the right, same `font-mono text-[11px]` as
elsewhere.

### Card 3 — Composición de ingresos

Two static bars (not per-quarter), scoped to `invoicesThisYear` (same scope
`topClients` already uses):

```
totalThisYear = Σ invoicesThisYear.filter(inv => inv.status !== "draft").map(inv => inv.total)
topClientShare = topClients[0]?.total / totalThisYear   // topClients already sorted desc by revenueByClient()

byClient = group invoicesThisYear (non-draft) by clientId, summing .total
repeatShare = Σ [total for clientId with invoice count >= 2] / totalThisYear
```

Bar 1 label: client name from `topClients[0]`, e.g. "Cliente principal
(Acme Corp)"; bar 2 label: "Clientes recurrentes (2+ facturas este año)".
Both use the same bar-with-label-and-percentage markup as
revenue-by-client/expenses-by-category rows, just showing a `%` instead of a
`€` amount. Card renders nothing (existing `dashboard.noData` string) when
`totalThisYear === 0`.

### Card 4 — Mayor categoría de gasto — tendencia

```
topCategory = expenseByCategory(recentExpenses)[0]?.category  // across the full 4-quarter window
categoryByQuarter[key] = Σ recentExpenses
                            .filter(e => expenseQuarterKey(e) === key && (e.category?.trim() || "Sin categoría") === topCategory)
                            .map(e => e.amount * (e.deductiblePct / 100))
```

Same single-bar-per-quarter markup as Card 1 (`bg-warn` fill, matching the
existing expenses color convention). Card title includes the category name:
`t("dashboard.analytics.topCategoryTrend.title", { category: topCategory })`.
Card renders nothing but `dashboard.noData` when there are no expenses in the
window at all.

## i18n

New keys under `dashboard.analytics` in `src/locales/{es,en}/common.json`:
`title` (section divider), `ivaTrend.title`, `ivaTrend.credit` (the
"IVA a tu favor" case), `paidVsOutstanding.title`, `composition.title`,
`composition.topClient`, `composition.repeatClients`,
`topCategoryTrend.title`.

## Out of scope

- No new `src/lib/` functions — everything stays inline in `Dashboard.tsx`,
  consistent with the rest of the file.
- No IRPF chart (see Card 1 rationale).
- No drill-down/click-through on any of the four new cards — they're
  read-only, unlike the existing trend card's quarter-strip navigation.
- No change to any existing card, section, or the in-progress
  quarter-comparison work already in the working tree.
