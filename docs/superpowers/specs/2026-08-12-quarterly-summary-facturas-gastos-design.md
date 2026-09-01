# Resumen trimestral: Facturas + Gastos sections

## Problem

`ResumenTrimestral` has two states depending on whether the focused quarter has a
`QuarterlyDeclaration`:

- **Declared** (`declaration` present): shows itemized Facturas and Gastos cards
  (flat lists, from the frozen `declaration.snapshot`), plus a deductible-totals /
  modelos grid.
- **Projection** (no declaration yet): only shows aggregate cards (IVA by rate,
  deductible totals) — no itemized invoice/expense lists at all.

Requested: add itemized Facturas + Gastos sections to both states, and let Gastos
be filtered by month within the quarter.

## Design

### `quarterMonths` helper (`src/lib/dateRange.ts`)

```ts
export function quarterMonths(year: number, quarter: 1 | 2 | 3 | 4): Period[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((i) => monthRange(year, startMonth + i));
}
```

Reuses the existing `monthRange`. One test added to `dateRange.test.ts` asserting
3 periods with correct `from`/`to`/label for a known quarter (including a Q4 case,
since Q4 is the one that could plausibly mis-handle a year rollover even though it
doesn't in practice).

### Two local components in `ResumenTrimestral.tsx`

Not extracted to their own file — nothing outside this screen uses them.

```ts
interface QuarterLineItem {
  id: number;
  date: string;
  label: string;
  amount: number;
}
```

- `FacturasCard({ title, items, emptyMessage })` — plain list, same row markup the
  declared view already has today (`date · label` / amount, mono, divided rows).
- `GastosMesTabs({ title, items, emptyMessage, year, quarter })` — same list markup,
  plus a `SegmentedControl` (existing primitive, not a new tab component) with
  options `["Todos", <month 1>, <month 2>, <month 3>]` built from `quarterMonths`.
  Selecting a month filters `items` by `date` within that month's range.
  Internal `useState` for the selected tab, default `"all"`.

Both call sites (`declaration ? … : …` branches) build a normalized
`QuarterLineItem[]` before rendering:

- Declared: from `declaration.snapshot.invoices` / `.expenses` (existing frozen
  fields: `issueDate`/`clientName`/`number`/`total`, `date`/`description`/
  `category`/`amount`).
- Projection: from `qInvoices` (`InvoiceListItem[]`, already computed in the
  component) and `expenses` (`ExpenseRecord[]`, already fetched in the component).
  Invoice number label uses the existing `invoiceNumberLabel()` from
  `src/lib/invoice.ts` (projection invoices don't have a pre-formatted `number`
  string the way a frozen declaration snapshot does).

`GastosMesTabs` is rendered with `key={focusedKey}` so switching the focused
quarter resets its tab selection to "Todos" instead of carrying over a stale month
index.

### Layout

A new 2-column grid row `[FacturasCard, GastosMesTabs]` is added right after the
KPI tiles, in both branches, before the branch's existing aggregate-cards grid:

- Declared: KPIs → **Facturas/Gastos grid (new)** → deductible-totals/modelos grid
  (unchanged). The old flat Gastos card is replaced by `GastosMesTabs`; the
  Facturas card's markup is unchanged, just now going through the shared
  `FacturasCard` component.
- Projection: KPIs → **Facturas/Gastos grid (new)** → IVA-by-rate/expense-totals
  grid (unchanged).

### i18n

New keys under `resumenTrimestral` (both `en` and `es` locale files) for the
projection view's card titles/empty states — the existing
`declarations.detail.invoicesTitle`/`expensesTitle`/`noInvoices`/`noExpenses`
keys say "incluidas en esta declaración" / "en esta declaración", which is
inaccurate before a declaration exists. The declared view keeps using its
existing `declarations.detail.*` keys (still accurate — a filed declaration did
include these).

New keys (es):

- `resumenTrimestral.invoicesTitle`: "Facturas"
- `resumenTrimestral.noInvoices`: "No hay facturas en este trimestre."
- `resumenTrimestral.expensesTitle`: "Gastos"
- `resumenTrimestral.noExpenses`: "No hay gastos en este trimestre."
- `resumenTrimestral.allMonths`: "Todos"

(mirrored in `en`)

## Out of scope

- No month filter on Facturas — only Gastos, per the request.
- No new data fetching — `qInvoices`, `expenses`, and `declaration.snapshot` are
  already loaded by the component.
- No changes to the tax-math totals cards (IVA by rate, deductible totals,
  modelos).
