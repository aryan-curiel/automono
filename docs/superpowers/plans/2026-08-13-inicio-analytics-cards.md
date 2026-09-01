# Inicio Analytics Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Análisis" section to the bottom of `Dashboard.tsx` (Inicio) with four read-only cards — IVA a liquidar per quarter, paid vs. outstanding per quarter, revenue composition, and the top expense category's trend — all derived from data `Dashboard` already fetches.

**Architecture:** Two grid rows of two cards each, added after the existing revenue-by-client / expenses-by-category grid. All derived values are inline `const`s in `Dashboard.tsx`, following this file's existing convention (see `invoicedByQuarter`/`expensesByQuarter`) — no new `src/lib/` functions. Two existing-but-unused-here helpers, `invoicesInPeriod` and `paidInvoicesInPeriod` (`src/lib/quarterlyDeclaration.ts`), do the drafts-excluded / paid-only filtering so nothing needs re-filtering by hand.

**Tech Stack:** Tauri 2 + React 19 + TypeScript + SQLite, react-i18next. Package manager: `bun`.

## Global Constraints

- No new `src/lib/` functions — all bucketing/derivation is inline in `Dashboard.tsx`, matching how `invoicedByQuarter`/`expensesByQuarter` already work in this file.
- i18n via `react-i18next` — every new string goes in `src/locales/{es,en}/common.json` under `dashboard.analytics`.
- This codebase has no component-level test harness (no `@testing-library`, no `.test.tsx` files — only pure-function tests in `src/lib`/`src/db`). Since this plan adds zero new `src/lib/` functions, there is nothing to unit-test; verification is typecheck + lint + running the app, per this codebase's established convention for screen-level UI changes.
- Typecheck: `bunx tsc --noEmit`. Lint: `bun run lint`.
- Do not modify any existing card, section, or the in-progress quarter-comparison work already in `Dashboard.tsx` — only append.

---

## File Structure

| File                                                                | Responsibility                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/screens/Dashboard.tsx` (modify)                                | New derived consts (IVA net, paid/pending, revenue composition, top-category trend) + new JSX section with 4 cards |
| `src/locales/es/common.json`, `src/locales/en/common.json` (modify) | New keys under `dashboard.analytics`                                                                               |

---

### Task 1: IVA-a-liquidar card + paid-vs-outstanding card

**Files:**

- Modify: `src/screens/Dashboard.tsx` (import, derived consts, JSX)
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json` (all `dashboard.analytics.*` keys — this task adds every key the whole plan needs, so Task 2 touches no JSON)

**Interfaces:**

- Consumes: `QUARTER_KEYS`, `quarterKeyRange`, `expenseQuarterKey`, `recentExpenses`, `invoices` — all existing in `Dashboard.tsx`. `invoicesInPeriod`, `paidInvoicesInPeriod` from `../lib/quarterlyDeclaration`.
- Produces (component scope, used only within this task's JSX): `ivaNetByQuarter: Map<string, number>`, `maxIvaNetValue: number`, `grossInvoicedByQuarter: Map<string, number>`, `paidByQuarter: Map<string, number>`.

- [ ] **Step 1: Add all analytics i18n keys — Spanish**

In `src/locales/es/common.json`, change:

```json
    "comparison": {
      "title": "Comparativa",
      "invoiced": "Facturado",
      "expenses": "Gastos",
      "net": "Neto",
      "subtitle": "vs. trimestre anterior"
    }
  },
```

to:

```json
    "comparison": {
      "title": "Comparativa",
      "invoiced": "Facturado",
      "expenses": "Gastos",
      "net": "Neto",
      "subtitle": "vs. trimestre anterior"
    },
    "analytics": {
      "title": "Análisis",
      "ivaTrend": {
        "title": "IVA a liquidar por trimestre",
        "credit": "IVA a tu favor: {{amount}}"
      },
      "paidVsOutstanding": {
        "title": "Cobrado vs. pendiente",
        "paid": "Cobrado",
        "pending": "Pendiente"
      },
      "composition": {
        "title": "Composición de ingresos",
        "topClient": "Cliente principal ({{client}})",
        "repeatClients": "Clientes recurrentes (2+ facturas este año)"
      },
      "topCategoryTrend": {
        "title": "Mayor categoría de gasto: {{category}}",
        "titleEmpty": "Mayor categoría de gasto"
      }
    }
  },
```

- [ ] **Step 2: Add all analytics i18n keys — English**

In `src/locales/en/common.json`, change:

```json
    "comparison": {
      "title": "Comparison",
      "invoiced": "Invoiced",
      "expenses": "Expenses",
      "net": "Net",
      "subtitle": "vs. previous quarter"
    }
  },
```

to:

```json
    "comparison": {
      "title": "Comparison",
      "invoiced": "Invoiced",
      "expenses": "Expenses",
      "net": "Net",
      "subtitle": "vs. previous quarter"
    },
    "analytics": {
      "title": "Analytics",
      "ivaTrend": {
        "title": "VAT due per quarter",
        "credit": "VAT credit: {{amount}}"
      },
      "paidVsOutstanding": {
        "title": "Paid vs. outstanding",
        "paid": "Paid",
        "pending": "Outstanding"
      },
      "composition": {
        "title": "Revenue composition",
        "topClient": "Top client ({{client}})",
        "repeatClients": "Repeat clients (2+ invoices this year)"
      },
      "topCategoryTrend": {
        "title": "Top expense category: {{category}}",
        "titleEmpty": "Top expense category"
      }
    }
  },
```

- [ ] **Step 3: Import `paidInvoicesInPeriod`**

In `src/screens/Dashboard.tsx`, change:

```ts
import { invoicesInPeriod } from "../lib/quarterlyDeclaration";
```

to:

```ts
import { invoicesInPeriod, paidInvoicesInPeriod } from "../lib/quarterlyDeclaration";
```

- [ ] **Step 4: Add the IVA and paid/pending derived consts**

Change:

```ts
const comparison = [
  comparisonRow(t("dashboard.comparison.invoiced"), currInvoiced, prevInvoiced),
  comparisonRow(t("dashboard.comparison.expenses"), currExpenses, prevExpenses),
  comparisonRow(
    t("dashboard.comparison.net"),
    currInvoiced - currExpenses,
    prevInvoiced - prevExpenses,
  ),
];

const recurring = recurringInvoiceCandidates(invoices, todayIso);
```

to:

```ts
const comparison = [
  comparisonRow(t("dashboard.comparison.invoiced"), currInvoiced, prevInvoiced),
  comparisonRow(t("dashboard.comparison.expenses"), currExpenses, prevExpenses),
  comparisonRow(
    t("dashboard.comparison.net"),
    currInvoiced - currExpenses,
    prevInvoiced - prevExpenses,
  ),
];

const ivaInvoicedByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.ivaAmount,
      0,
    );
    return [key, total] as const;
  }),
);
const ivaDeductibleByQuarter = new Map(QUARTER_KEYS.map((key) => [key, 0] as [string, number]));
for (const expense of recentExpenses) {
  const key = expenseQuarterKey(expense);
  if (ivaDeductibleByQuarter.has(key)) {
    ivaDeductibleByQuarter.set(
      key,
      ivaDeductibleByQuarter.get(key)! + (expense.ivaAmount ?? 0) * (expense.deductiblePct / 100),
    );
  }
}
const ivaNetByQuarter = new Map(
  QUARTER_KEYS.map(
    (key) =>
      [key, (ivaInvoicedByQuarter.get(key) ?? 0) - (ivaDeductibleByQuarter.get(key) ?? 0)] as const,
  ),
);
const maxIvaNetValue = Math.max(
  1,
  ...QUARTER_KEYS.map((key) => Math.max(0, ivaNetByQuarter.get(key) ?? 0)),
);

const grossInvoicedByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);
const paidByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);

const recurring = recurringInvoiceCandidates(invoices, todayIso);
```

- [ ] **Step 5: Add the section divider and first grid row**

In `src/screens/Dashboard.tsx`, change:

```tsx
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.expensesByCategory.title", { period: quarterPeriod.label })}
          </div>
          {topCategories.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {topCategories.map((c) => (
            <div key={c.category} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-[13.5px] truncate min-w-0">{c.category}</span>
                <span className="font-semibold text-[13px] font-mono shrink-0">
                  {formatEUR(c.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div
                  className="h-full rounded-full bg-warn"
                  style={{ width: `${(c.total / maxCategoryExpense) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
```

to:

```tsx
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.expensesByCategory.title", { period: quarterPeriod.label })}
          </div>
          {topCategories.length === 0 && (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          )}
          {topCategories.map((c) => (
            <div key={c.category} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-[13.5px] truncate min-w-0">{c.category}</span>
                <span className="font-semibold text-[13px] font-mono shrink-0">
                  {formatEUR(c.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                <div
                  className="h-full rounded-full bg-warn"
                  style={{ width: `${(c.total / maxCategoryExpense) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mt-8 mb-4">
        {t("dashboard.analytics.title")}
      </div>

      <div className="grid grid-cols-2 gap-4">
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
                    <span className="font-mono text-[11px] w-20 text-right shrink-0">
                      {formatEUR(net)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {t("dashboard.analytics.paidVsOutstanding.title")}
          </div>
          {QUARTER_KEYS.map((key) => {
            const total = grossInvoicedByQuarter.get(key) ?? 0;
            const paid = paidByQuarter.get(key) ?? 0;
            const pending = Math.max(0, total - paid);
            const paidPct = total > 0 ? (paid / total) * 100 : 0;
            const pendingPct = total > 0 ? (pending / total) * 100 : 0;
            return (
              <div key={key} className="py-2 border-b border-border last:border-b-0">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span>{quarterKeyLabel(key)}</span>
                  <span className="font-mono text-ink-soft">{formatEUR(total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden flex">
                  <div className="h-full bg-success" style={{ width: `${paidPct}%` }} />
                  <div className="h-full bg-warn" style={{ width: `${pendingPct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {t("dashboard.analytics.paidVsOutstanding.paid")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warn" />
              {t("dashboard.analytics.paidVsOutstanding.pending")}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 7: Manually verify**

Run: `bun run tauri dev`, open Inicio, scroll to the new "Análisis" section.
Expected:

- Two new cards render: "IVA a liquidar por trimestre" and "Cobrado vs. pendiente".
- IVA card shows one row per quarter with a bar + € amount; if any quarter's deductible IVA exceeds invoiced IVA, that row shows green "IVA a tu favor: €X" text instead of a bar.
- Paid/pending card shows a two-color stacked bar per quarter (green = paid, amber = pending) with a legend below, and the total € label per row matches gross invoiced (IVA-inclusive) for that quarter.
- Both cards match the visual weight (padding, borders, font sizes) of the cards above them.

- [ ] **Step 8: Commit**

```bash
git add src/screens/Dashboard.tsx src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: add IVA and paid-vs-outstanding trend cards to Inicio"
```

---

### Task 2: Revenue-composition card + top-expense-category trend card

**Files:**

- Modify: `src/screens/Dashboard.tsx` (derived consts, JSX)

**Interfaces:**

- Consumes: `invoicesThisYear`, `topClients`, `recentExpenses`, `QUARTER_KEYS`, `expenseQuarterKey` — all existing. `revenueByClient`, `expenseByCategory` from `../lib/analytics` (already imported in this file).
- Produces (component scope, used only within this task's JSX): `totalRevenueThisYear: number`, `topClientShare: number`, `repeatClientShare: number`, `topExpenseCategory: string | undefined`, `categoryTrendByQuarter: Map<string, number>`, `maxCategoryTrendValue: number`.

- [ ] **Step 1: Add the composition and top-category derived consts**

In `src/screens/Dashboard.tsx`, change:

```ts
const grossInvoicedByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);
const paidByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);

const recurring = recurringInvoiceCandidates(invoices, todayIso);
```

to:

```ts
const grossInvoicedByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
      (s, inv) => s + inv.total,
      0,
    );
    return [key, total] as const;
  }),
);
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
for (const inv of invoicesThisYear) {
  if (inv.status === "draft") continue;
  clientInvoiceCountThisYear.set(
    inv.clientId,
    (clientInvoiceCountThisYear.get(inv.clientId) ?? 0) + 1,
  );
}
const revenueByClientThisYear = revenueByClient(invoicesThisYear);
const totalRevenueThisYear = revenueByClientThisYear.reduce((s, c) => s + c.total, 0);
const repeatRevenueThisYear = revenueByClientThisYear
  .filter((c) => (clientInvoiceCountThisYear.get(c.clientId) ?? 0) >= 2)
  .reduce((s, c) => s + c.total, 0);
const topClientShare =
  totalRevenueThisYear > 0 ? (topClients[0]?.total ?? 0) / totalRevenueThisYear : 0;
const repeatClientShare =
  totalRevenueThisYear > 0 ? repeatRevenueThisYear / totalRevenueThisYear : 0;

const topExpenseCategory = expenseByCategory(recentExpenses)[0]?.category;
const categoryTrendByQuarter = new Map(
  QUARTER_KEYS.map((key) => {
    const total = recentExpenses
      .filter(
        (e) =>
          expenseQuarterKey(e) === key &&
          (e.category?.trim() || "Sin categoría") === topExpenseCategory,
      )
      .reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0);
    return [key, total] as const;
  }),
);
const maxCategoryTrendValue = Math.max(
  1,
  ...QUARTER_KEYS.map((key) => categoryTrendByQuarter.get(key) ?? 0),
);

const recurring = recurringInvoiceCandidates(invoices, todayIso);
```

- [ ] **Step 2: Add the second grid row**

In `src/screens/Dashboard.tsx`, change:

```tsx
          <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {t("dashboard.analytics.paidVsOutstanding.paid")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warn" />
              {t("dashboard.analytics.paidVsOutstanding.pending")}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
```

to:

```tsx
          <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {t("dashboard.analytics.paidVsOutstanding.paid")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warn" />
              {t("dashboard.analytics.paidVsOutstanding.pending")}
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Card className="p-6">
          <div className="font-bold text-sm mb-4">{t("dashboard.analytics.composition.title")}</div>
          {totalRevenueThisYear === 0 ? (
            <div className="text-xs text-ink-soft">{t("dashboard.noData")}</div>
          ) : (
            <>
              <div className="py-2 border-b border-border">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-medium text-[13.5px] truncate min-w-0">
                    {t("dashboard.analytics.composition.topClient", {
                      client: topClients[0]?.clientName ?? "",
                    })}
                  </span>
                  <span className="font-semibold text-[13px] font-mono shrink-0">
                    {Math.round(topClientShare * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${topClientShare * 100}%` }}
                  />
                </div>
              </div>
              <div className="py-2">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-medium text-[13.5px]">
                    {t("dashboard.analytics.composition.repeatClients")}
                  </span>
                  <span className="font-semibold text-[13px] font-mono shrink-0">
                    {Math.round(repeatClientShare * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${repeatClientShare * 100}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        <Card className="p-6">
          <div className="font-bold text-sm mb-4">
            {topExpenseCategory
              ? t("dashboard.analytics.topCategoryTrend.title", { category: topExpenseCategory })
              : t("dashboard.analytics.topCategoryTrend.titleEmpty")}
          </div>
          {!topExpenseCategory ? (
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
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Run: `bun run tauri dev`, open Inicio, scroll to "Análisis".
Expected:

- "Composición de ingresos" shows two bars with percentages: top client's share, and repeat-clients' share (both 0-100%, never NaN/Infinity even with only one client or one invoice).
- "Mayor categoría de gasto: <category>" shows one bar per quarter for that single category, title includes the actual top category name.
- If there are no expenses in the 4-quarter window, that card shows the empty title + "Sin datos todavía" instead of a category name and empty rows.
- If there are no non-draft invoices this year, "Composición de ingresos" shows "Sin datos todavía" instead of two 0% bars.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Dashboard.tsx
git commit -m "feat: add revenue-composition and top-category-trend cards to Inicio"
```

---

### Task 3: Full manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Start the app**

Run: `bun run tauri dev`

- [ ] **Step 2: Verify all four cards against real data**

On Inicio's "Análisis" section, spot-check one quarter's numbers against Facturas/Gastos filtered to that period:

- IVA card: manually sum that quarter's issued+paid invoices' IVA, and that quarter's deductible expense IVA; confirm the displayed net (or credit) matches.
- Paid/pending card: confirm the green segment width matches paid invoices' share of that quarter's gross total.
- Composition card: confirm the top-client % matches `topClient.total / totalRevenueThisYear` by hand for the current year.
- Top-category card: confirm the named category is genuinely the largest by total deductible spend across the 4-quarter window (compare against the existing "Gastos por categoría" card, which is current-quarter-only, so the named category may differ from that card's #1 — that's expected).

- [ ] **Step 3: Check empty-state rendering**

If your dev database currently has data in every quarter/category, temporarily verify the empty-state branches read correctly by inspecting the JSX conditions added in Tasks 1-2 (`totalRevenueThisYear === 0`, `!topExpenseCategory`, `net < 0`) rather than emptying real data.

- [ ] **Step 4: Check both themes**

Toggle light/dark in Ajustes; confirm all four new cards — bar colors (`bg-accent`, `bg-warn`, `bg-success`), the "IVA a tu favor" green text, and the paid/pending legend dots — stay readable and distinguishable in both.

- [ ] **Step 5: Verify nothing above the new section regressed**

Confirm the hero card, KPI row, comparison/trend cards, recurring invoices, recent invoices, upcoming due, aging, tax calendar, revenue-by-client, and expenses-by-category cards all still render exactly as before this plan.

- [ ] **Step 6: Final commit (if any fixups were needed)**

If Steps 2-5 surfaced any issue requiring a code change, fix it, re-run the relevant verification step, then:

```bash
git add -A
git commit -m "fix: address issues found in Inicio analytics cards manual verification"
```

If no fixups were needed, no commit here — the plan is complete as of Task 2's commit.
