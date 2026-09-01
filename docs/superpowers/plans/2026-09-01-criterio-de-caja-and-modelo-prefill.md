# Criterio de caja toggle + Modelo pre-fill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in *criterio de caja* (cash-basis IVA) toggle that switches the quarterly declaration/projection to paid-only invoices and payment-dated expenses, labels every snapshot with its basis, and adds an AEAT casilla pre-fill panel to the declaration detail.

**Architecture:** Two GitHub issues in one PR. #31 adds a `criterio_caja` preference, a `paid_date` column on expenses, cash-basis filter variants in the pure tax-math module (`src/lib/quarterlyDeclaration.ts`), and threads the chosen basis through the projection, the declaration wizard, the in-progress recompute path, and three read-only "which basis" labels (this absorbs issue #48). #38 is a pure read-only render of the existing `expectedCasillas()` output. No Rust logic beyond migration registration; all tax math stays in `src/lib/`.

**Tech Stack:** Tauri 2, React 19, TypeScript, `@tauri-apps/plugin-sql` (SQLite), Vitest, `react-i18next`, Radix primitives.

**Spec:** In-chat bounded design approved 2026-09-01 (see PR description). Source: `REPORT.md` §8.3 (criterio de caja) and §8.10 (modelo pre-fill); GitHub issues #31, #38, #48.

## Global Constraints

- Package manager is **bun** — `bun run <script>`, never npm/yarn.
- Migrations: new `src-tauri/migrations/NNNN_*.sql` must ALSO be added to `all_migrations()` in `src-tauri/src/lib.rs`, in order. Keep the `all_sql_files_are_registered_as_migrations` Rust test green.
- Both new migrations are additive `ALTER TABLE ... ADD COLUMN` with a default or nullable — no create-copy-drop-rename needed.
- Tax math lives in `src/lib/` / `src/features/`, never Rust.
- Design: one accent color (terracotta) only; no responsive breakpoints; motion respects `prefers-reduced-motion`. This change adds no new motion and no new colors.
- Spanish is the primary locale. Every user-facing string gets both `src/locales/es/common.json` and `src/locales/en/common.json` entries, `es` written first.
- The toggle is **global** (not per-quarter). Already-frozen (`completed`) declarations are **never** recomputed — they keep their stamped basis; a frozen snapshot with no `basis` field reads as `"accrual"` (the `buildDeclarationSnapshot` default already does this via issue #2's type).
- Cash-basis known ceiling (`ponytail:` comment required): invoice cash filter = "status paid, issue date in period" (not real collection-date attribution); expense cash filter uses `paid_date ?? date` over the caller-supplied list. Precise cross-quarter payment attribution is deferred to issue #36 (bank reconciliation).

---

### Task 1: `criterio_caja` preference + Ajustes toggle

**Files:**
- Create: `src-tauri/migrations/0036_preferences_criterio_caja.sql`
- Modify: `src-tauri/src/lib.rs` (register migration 36, after the `0035_llm_settings_provider_models.sql` entry near line 231)
- Modify: `src/db/preferences.ts` (add field to `PreferencesRecord`, `PreferencesRow`, `mapRow`, both SQL statements in `getPreferences` / `updatePreferences`)
- Modify: `src/screens/Ajustes.tsx` (state + `Switch.Root`, mirroring `presentsModelo111` at ~line 562-576; load at ~line 221; save at ~line 284)
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json`
- Test: `src/db/migrations.test.ts` already re-scans the `migrations/` dir and replays every `.sql` — no new test needed there; the Rust guard test covers registration.

**Interfaces:**
- Produces: `PreferencesRecord.criterioCaja: boolean` (default `false`).

- [ ] **Step 1: Write the migration**

`src-tauri/migrations/0036_preferences_criterio_caja.sql`:
```sql
-- Criterio de caja (cash-basis IVA / IRPF): when on, the quarterly declaration and the live
-- projection count only invoices already marked paid and attribute expenses by their payment
-- date. Off by default — the Spanish default is accrual (devengo). Opt in from Ajustes.
ALTER TABLE preferences ADD COLUMN criterio_caja INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register it in `lib.rs`**

After the migration 34 `Migration { ... }` struct (the `0035_llm_settings_provider_models.sql` entry, `version: 34`), add. NOTE: registered `version` lags the filename by one because there is no `0021` file (issue #15) — the guard test expects `migrations[i].version == i + 1` over sorted files, so file `0036` is the 35th file → `version: 35`:
```rust
Migration {
    version: 35,
    description: "preferences_criterio_caja",
    sql: include_str!("../migrations/0036_preferences_criterio_caja.sql"),
    kind: MigrationKind::Up,
},
```
(Match the exact field style of the surrounding structs — check `version`/`description`/`sql`/`kind` ordering against neighbours.)

- [ ] **Step 3: Run the Rust guard test to verify registration**

Run: `cd src-tauri && cargo test all_sql_files_are_registered_as_migrations`
Expected: PASS.

- [ ] **Step 4: Thread the field through `src/db/preferences.ts`**

- Add to `PreferencesRecord`: `/** When true, declaration + projection use cash basis (criterio de caja) instead of accrual. */ criterioCaja: boolean;`
- Add to `PreferencesRow`: `criterio_caja: number;`
- In `mapRow`: `criterioCaja: row.criterio_caja === 1,`
- In `getPreferences` SELECT: add `, criterio_caja`
- In `updatePreferences` UPDATE: add `, criterio_caja = $8` and append `next.criterioCaja ? 1 : 0` to the params array (renumber if needed — it's currently `$1..$7`).

- [ ] **Step 5: Add the Ajustes toggle**

In `src/screens/Ajustes.tsx`, mirror `presentsModelo111`:
- `const [criterioCaja, setCriterioCaja] = useState(false);`
- in the prefs load effect: `setCriterioCaja(prefs.criterioCaja);`
- in the save handler `updatePreferences({ ..., criterioCaja });`
- a `FormRow` with `label={t("settings.fields.criterioCaja")}` containing a `Switch.Root` (copy the exact class strings from the `presentsModelo111` switch) bound to `criterioCaja` / `setCriterioCaja`, with the on/off text `{criterioCaja ? t("settings.on") : t("settings.off")}`.
- Add a one-line `<p className="text-xs text-ink-soft ...">` hint under it: `t("settings.fields.criterioCajaHint")`.

- [ ] **Step 6: Add i18n strings**

`es`: `settings.fields.criterioCaja` = `"Criterio de caja"`, `settings.fields.criterioCajaHint` = `"Solo cuenta facturas cobradas y gastos por fecha de pago. Por defecto se usa el criterio de devengo."`
`en`: `settings.fields.criterioCaja` = `"Cash basis"`, `settings.fields.criterioCajaHint` = `"Counts only paid invoices and expenses by payment date. Accrual basis is used by default."`

- [ ] **Step 7: Typecheck + commit**

Run: `bun run build`
Expected: PASS (tsc clean).
```bash
git add src-tauri/migrations/0036_preferences_criterio_caja.sql src-tauri/src/lib.rs src/db/preferences.ts src/screens/Ajustes.tsx src/locales
git commit -m "feat(#31): criterio de caja preference + Ajustes toggle"
```

---

### Task 2: cash-basis filters in `quarterlyDeclaration.ts`

**Files:**
- Modify: `src/lib/quarterlyDeclaration.ts`
- Test: `src/lib/quarterlyDeclaration.test.ts`

**Interfaces:**
- Consumes: `DeclarationBasis` (already exported: `"accrual" | "cash"`), `Period`, `InvoiceListItem`, `ExpenseRecord`.
- Produces:
  - `cashInvoicesInPeriod(invoices: InvoiceListItem[], period: Period): InvoiceListItem[]` — `status === "paid"`, `issueDate` in `[period.from, period.to]`.
  - `invoicesForBasis(invoices, period, basis): InvoiceListItem[]` — dispatches to `invoicesInPeriod` (accrual) or `cashInvoicesInPeriod` (cash).
  - `expensesForBasis(expenses: ExpenseRecord[], period: Period, basis: DeclarationBasis): ExpenseRecord[]` — accrual → existing `expensesInPeriod`; cash → same override logic but the natural-quarter test uses `e.paidDate ?? e.date`.
  - `buildDeclarationSnapshot(invoices, expenses, basis: DeclarationBasis = "accrual")` — third param, defaulted; only stamps `snapshot.basis`. All existing 2-arg callers keep working.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/quarterlyDeclaration.test.ts`:
```ts
import {
  buildDeclarationSnapshot,
  cashInvoicesInPeriod,
  invoicesForBasis,
  expensesForBasis,
  invoicesInPeriod,
} from "./quarterlyDeclaration";

describe("cash basis filters", () => {
  const period = quarterRange(2026, 1); // 2026-01-01..2026-03-31

  it("cashInvoicesInPeriod keeps only paid invoices dated in the period", () => {
    const invs = [
      invoice({ id: 1, issueDate: "2026-02-01", status: "paid" }),
      invoice({ id: 2, issueDate: "2026-02-01", status: "issued" }),
      invoice({ id: 3, issueDate: "2025-12-30", status: "paid" }),
    ];
    expect(cashInvoicesInPeriod(invs, period).map((i) => i.id)).toEqual([1]);
  });

  it("invoicesForBasis dispatches by basis", () => {
    const invs = [
      invoice({ id: 1, issueDate: "2026-02-01", status: "paid" }),
      invoice({ id: 2, issueDate: "2026-02-01", status: "issued" }),
    ];
    expect(invoicesForBasis(invs, period, "accrual").map((i) => i.id)).toEqual([1, 2]);
    expect(invoicesForBasis(invs, period, "cash").map((i) => i.id)).toEqual([1]);
  });

  it("expensesForBasis (cash) attributes by paidDate when set, else date", () => {
    const e = (o: Partial<ExpenseRecord>): ExpenseRecord =>
      ({
        id: 1, date: "2026-01-15", category: null, description: null, amount: 100,
        ivaAmount: 21, deductiblePct: 100, ivaDeductiblePct: null, irpfRate: null,
        irpfAmount: null, receiptFilePath: null, declaredPeriod: null, declared: false,
        paidDate: null, ...o,
      }) as ExpenseRecord;
    // dated in Q1 but paid in Q2 -> excluded from Q1 under cash basis
    expect(expensesForBasis([e({ id: 1, paidDate: "2026-04-10" })], period, "cash")).toHaveLength(0);
    // dated in Q1, no paidDate -> falls back to date -> included
    expect(expensesForBasis([e({ id: 2, paidDate: null })], period, "cash")).toHaveLength(1);
    // accrual ignores paidDate entirely
    expect(expensesForBasis([e({ id: 3, paidDate: "2026-04-10" })], period, "accrual")).toHaveLength(1);
  });

  it("buildDeclarationSnapshot stamps the basis it was told", () => {
    expect(buildDeclarationSnapshot([], [], "cash").basis).toBe("cash");
    expect(buildDeclarationSnapshot([], []).basis).toBe("accrual");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/lib/quarterlyDeclaration.test.ts`
Expected: FAIL — `cashInvoicesInPeriod` / `invoicesForBasis` / `expensesForBasis` not exported; `buildDeclarationSnapshot` ignores 3rd arg.

- [ ] **Step 3: Implement**

In `src/lib/quarterlyDeclaration.ts`:
```ts
/** Cash-basis (criterio de caja) counterpart to `invoicesInPeriod`: only invoices already
 * collected, still keyed by issue date.
 * ponytail: no real collection-date attribution — an invoice issued Q1 / paid Q3 stays in Q1,
 * just gated on being paid. Real payment-date bookkeeping lands with issue #36 (bank rec). */
export function cashInvoicesInPeriod(
  invoices: InvoiceListItem[],
  period: Period,
): InvoiceListItem[] {
  return invoices.filter(
    (inv) =>
      inv.status === "paid" &&
      inv.issueDate !== null &&
      inv.issueDate >= period.from &&
      inv.issueDate <= period.to,
  );
}

export function invoicesForBasis(
  invoices: InvoiceListItem[],
  period: Period,
  basis: DeclarationBasis,
): InvoiceListItem[] {
  return basis === "cash"
    ? cashInvoicesInPeriod(invoices, period)
    : invoicesInPeriod(invoices, period);
}

/** Cash-basis counterpart to `expensesInPeriod`: an expense's natural quarter is that of its
 * payment date (`paidDate`) when recorded, otherwise its `date`. `declaredPeriod` overrides win
 * either way (same as accrual). */
export function expensesForBasis(
  expenses: ExpenseRecord[],
  period: Period,
  basis: DeclarationBasis,
): ExpenseRecord[] {
  if (basis !== "cash") return expensesInPeriod(expenses, period);
  const quarterKeys = quartersInRange(period.from, period.to);
  return expenses.filter((e) => {
    if (e.declaredPeriod != null) return quarterKeys.includes(e.declaredPeriod);
    const effective = e.paidDate ?? e.date;
    return effective >= period.from && effective <= period.to;
  });
}
```
Change the `buildDeclarationSnapshot` signature to:
```ts
export function buildDeclarationSnapshot(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  basis: DeclarationBasis = "accrual",
): DeclarationSnapshot {
```
and in the returned object replace `basis: "accrual",` with `basis,`.

> Note: `ExpenseRecord.paidDate` is added in Task 3. If executing this task first, add `paidDate: null` to the test helper (done above) and the field will resolve once Task 3 lands. If your executor runs tasks in order, do Task 3's expenses.ts change first — either order compiles because `paidDate` is optional-nullable.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/lib/quarterlyDeclaration.test.ts`
Expected: PASS (all existing tests still green — the `basis` default preserves them).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quarterlyDeclaration.ts src/lib/quarterlyDeclaration.test.ts
git commit -m "feat(#31): cash-basis invoice/expense filters + basis-stamped snapshot"
```

---

### Task 3: `paid_date` column on expenses + GastoForm field

**Files:**
- Create: `src-tauri/migrations/0037_expense_paid_date.sql`
- Modify: `src-tauri/src/lib.rs` (register migration 37)
- Modify: `src/db/expenses.ts` — `ExpenseRecord` (add `paidDate: string | null`), `ExpenseRow` (add `paid_date: string | null`), `mapRow`, `createExpense` INSERT column list + params, `COLUMN_BY_KEY` (`paidDate: "paid_date"`)
- Modify: `src/screens/GastoForm.tsx` — form state field, initial values, edit-hydration, `FormRow` with `type="date"` input, payload in the save handler
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json`
- Test: `src/db/migrations.test.ts` auto-covers the schema replay; add one assertion (below).

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExpenseRecord.paidDate: string | null` (ISO `YYYY-MM-DD`), surfaced through `createExpense` / `updateExpense` / `getExpense` / `listExpenses`.

- [ ] **Step 1: Write the migration**

`src-tauri/migrations/0037_expense_paid_date.sql`:
```sql
-- Payment date of the expense (when the money actually left the account), ISO "YYYY-MM-DD".
-- Nullable: only meaningful under criterio de caja, where an expense is attributed to the
-- quarter it was paid in rather than the quarter of its `date`. Left null = fall back to `date`.
ALTER TABLE expenses ADD COLUMN paid_date TEXT;
```

- [ ] **Step 2: Register in `lib.rs`**

```rust
Migration {
    version: 36,
    description: "expense_paid_date",
    sql: include_str!("../migrations/0037_expense_paid_date.sql"),
    kind: MigrationKind::Up,
},
```

- [ ] **Step 3: Add a schema assertion + run the Rust guard**

In `src/db/migrations.test.ts`, in whichever test asserts expense columns (or add a small `it`):
```ts
it("expenses has a nullable paid_date column", () => {
  const cols = db.prepare("PRAGMA table_info(expenses)").all() as { name: string; notnull: number }[];
  const col = cols.find((c) => c.name === "paid_date");
  expect(col).toBeDefined();
  expect(col!.notnull).toBe(0);
});
```
Run: `bun run test src/db/migrations.test.ts` → PASS.
Run: `cd src-tauri && cargo test all_sql_files_are_registered_as_migrations` → PASS.

- [ ] **Step 4: Thread through `src/db/expenses.ts`**

- `ExpenseRecord`: add `/** Payment date (criterio de caja), ISO "YYYY-MM-DD". Null = use \`date\`. */ paidDate: string | null;`
- `ExpenseRow`: add `paid_date: string | null;`
- `mapRow`: add `paidDate: row.paid_date,`
- `createExpense`: add `paid_date` to the INSERT column list, `$13` placeholder, and `input.paidDate` to the params array (shift `declared`'s `$12`→`$13`? — no: append `paid_date` last, so it becomes `$13` and `declared` stays `$12`... actually re-read: current list ends `..., declared_period, declared) VALUES ($1..$12)`. Insert `paid_date` before `declared_period` OR append at end. Append at end is safest: `..., declared, paid_date) VALUES ($1..$13)` with `input.paidDate` last.)
- `COLUMN_BY_KEY`: add `paidDate: "paid_date",`

- [ ] **Step 5: Add the GastoForm field**

In `src/screens/GastoForm.tsx`:
- form-state type: add `paidDate: string;`
- blank initial: `paidDate: "",`
- edit hydration (the `expense.*` mapper): `paidDate: expense.paidDate ?? "",`
- render a `FormRow label={t("expenses.fields.paidDate")}` with `<TextInput type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} />` — place it right after the `date` FormRow.
- in the save `payload`: `paidDate: form.paidDate || null,`
- No validation: `paid_date` is optional and unconstrained (a payment can precede or follow the invoice date).

- [ ] **Step 6: i18n**

`es`: `expenses.fields.paidDate` = `"Fecha de pago"`
`en`: `expenses.fields.paidDate` = `"Payment date"`

- [ ] **Step 7: Typecheck + commit**

Run: `bun run build` → PASS.
```bash
git add src-tauri/migrations/0037_expense_paid_date.sql src-tauri/src/lib.rs src/db/expenses.ts src/screens/GastoForm.tsx src/db/migrations.test.ts src/locales
git commit -m "feat(#31): paid_date column on expenses + GastoForm field"
```

---

### Task 4: thread basis through projection, wizard, recompute, and the three basis labels (absorbs #48)

**Files:**
- Modify: `src/screens/ResumenTrimestral.tsx` — load `criterioCaja` into the existing prefs effect (~line 260); derive `basis`; use `invoicesForBasis` / `expensesForBasis` for `qInvoices` / projection expenses (~line 364-365); pass `basis` to `buildDeclarationSnapshot`; pass `basis` prop to `<DeclarationWizard>` (~line 804); render the basis note near the projection KPIs and near the frozen-detail KPIs.
- Modify: `src/components/DeclarationWizard.tsx` — accept `basis: DeclarationBasis` prop; filter `periodInvoices` via `invoicesForBasis`, `includedExpenses` base set via `expensesForBasis`; pass `basis` into `buildDeclarationSnapshot`; render a one-line note in step 1.
- Modify: `src/db/declarations.ts` — `currentSnapshot` (recompute path for `in_progress`) reads `getPreferences()` and passes the basis into `buildDeclarationSnapshot` + the `invoicesForBasis` / `expensesForBasis` filters it uses.
- Create: `src/components/BasisNote.tsx` — tiny shared presentational component (label + `Tooltip`), used in all three spots.
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json`
- Test: `src/lib/quarterlyDeclaration.test.ts` — the existing "projection basis equals wizard basis" test (already present) still passes; extend it to assert it holds under `basis: "cash"` too.

**Interfaces:**
- Consumes: `invoicesForBasis`, `expensesForBasis`, `buildDeclarationSnapshot(_, _, basis)` (Task 2); `PreferencesRecord.criterioCaja` (Task 1); `ExpenseRecord.paidDate` (Task 3).
- Produces:
  - `<BasisNote basis={DeclarationBasis} />` — renders "Criterio: devengo/caja" + an info tooltip explaining the basis. When `basis` is a frozen snapshot value that is `undefined`, caller passes `"accrual"` (fallback for pre-#2 snapshots).
  - `DeclarationWizardProps.basis: DeclarationBasis` (new required prop).

- [ ] **Step 1: Create `src/components/BasisNote.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { Info } from "@phosphor-icons/react";
import { Tooltip } from "./ui/Tooltip";
import type { DeclarationBasis } from "../lib/quarterlyDeclaration";

/** One-line "which tax basis produced these figures" caption. Accrual (devengo) is the Spanish
 * default for Modelo 303/130; cash (criterio de caja) is the opt-in from Ajustes (#31). */
export function BasisNote({ basis }: { basis: DeclarationBasis }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-soft">
      <span>{t(`declarations.basis.${basis}.label`)}</span>
      <Tooltip content={t(`declarations.basis.${basis}.hint`)}>
        <Info size={13} className="text-ink-soft/70" />
      </Tooltip>
    </div>
  );
}
```
(Check the real `Tooltip` API in `src/components/ui/Tooltip.tsx` and match it — `content` prop vs children may differ.)

- [ ] **Step 2: i18n for the note**

`es`:
- `declarations.basis.accrual.label` = `"Criterio de devengo"`
- `declarations.basis.accrual.hint` = `"Incluye todas las facturas emitidas del trimestre, estén cobradas o no, y los gastos por su fecha. Es el criterio estándar para el Modelo 303/130."`
- `declarations.basis.cash.label` = `"Criterio de caja"`
- `declarations.basis.cash.hint` = `"Solo incluye facturas cobradas y gastos por su fecha de pago."`

`en`:
- `declarations.basis.accrual.label` = `"Accrual basis"`
- `declarations.basis.accrual.hint` = `"Includes every invoice issued this quarter whether collected or not, and expenses by their date. This is the standard basis for Modelo 303/130."`
- `declarations.basis.cash.label` = `"Cash basis"`
- `declarations.basis.cash.hint` = `"Includes only collected invoices and expenses by their payment date."`

- [ ] **Step 3: `ResumenTrimestral.tsx` — derive and apply basis**

- Add `const [criterioCaja, setCriterioCaja] = useState(false);` and in the prefs effect `setCriterioCaja(prefs.criterioCaja);`
- `const basis: DeclarationBasis = criterioCaja ? "cash" : "accrual";`
- Replace `const qInvoices = invoicesInPeriod(invoices, period);` → `invoicesForBasis(invoices, period, basis)`.
- The projection currently passes the full `expenses` list to `buildDeclarationSnapshot(qInvoices, expenses)`. Wrap: `buildDeclarationSnapshot(qInvoices, expensesForBasis(expenses, period, basis), basis)`. (If `expenses` is already period-filtered upstream, `expensesForBasis` with accrual is a near-noop; with cash it re-buckets by `paidDate`. Verify what `expenses` holds — the state comment at line ~272 says it's the quarter's expenses.)
- Render `<BasisNote basis={basis} />` just above or beside the projection KPI grid (~line 690s).
- For the frozen declaration detail, render `<BasisNote basis={declaration.snapshot.basis ?? "accrual"} />` near its KPI grid (~line 555). This is the #48 requirement.

- [ ] **Step 4: `DeclarationWizard.tsx` — accept and apply basis**

- Add `basis: DeclarationBasis;` to `DeclarationWizardProps`, destructure it.
- Wherever `periodInvoices` is derived (`invoicesInPeriod(invoices, ...)`), use `invoicesForBasis(invoices, period, basis)`.
- Wherever the expense base set is derived, wrap with `expensesForBasis(expenses, period, basis)` before the `excludedExpenseIds` filter.
- `buildDeclarationSnapshot(periodInvoices, includedExpenses, basis)`.
- In step 1's JSX, add `<BasisNote basis={basis} />` under the step title.
- In `ResumenTrimestral.tsx`, pass `basis={basis}` to `<DeclarationWizard>`.

- [ ] **Step 5: `declarations.ts` — recompute path honours the preference**

In `currentSnapshot` (the `in_progress` branch that calls `buildDeclarationSnapshot`):
```ts
import { getPreferences } from "./preferences";
// ...
const { criterioCaja } = await getPreferences();
const basis: DeclarationBasis = criterioCaja ? "cash" : "accrual";
return buildDeclarationSnapshot(
  invoicesForBasis(invoices, period, basis),
  expensesForBasis(expenses, period, basis),
  basis,
);
```
Check `currentSnapshot`'s current signature — if it's sync, make it `async` and update its callers (`getDeclaration`, `listDeclarations`), which are already `async`. The `completed` branch is unchanged (returns the frozen JSON as-is).

- [ ] **Step 6: Extend the projection-vs-wizard basis test**

In `src/lib/quarterlyDeclaration.test.ts`, find the existing test asserting the projection snapshot equals the wizard/declaration snapshot. Add a sibling case that builds both with `"cash"` and the same paid-invoice set, asserting `.basis === "cash"` and equal totals.

Run: `bun run test src/lib/quarterlyDeclaration.test.ts` → PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `bun run build` → PASS.
```bash
git add src/screens/ResumenTrimestral.tsx src/components/DeclarationWizard.tsx src/components/BasisNote.tsx src/db/declarations.ts src/lib/quarterlyDeclaration.test.ts src/locales
git commit -m "feat(#31, #48): thread tax basis through projection/wizard/recompute + basis labels"
```

---

### Task 5: Modelo casilla pre-fill panel (#38)

**Files:**
- Create: `src/components/CasillaPrefill.tsx`
- Modify: `src/screens/ResumenTrimestral.tsx` — render `<CasillaPrefill>` in the declaration-detail "Modelos" card area (~line 618-653), once per `activeModelos` entry, passing the snapshot and (for 130) the already-computed `cumulativeModelo130(...)` value.
- Modify: `src/locales/es/common.json`, `src/locales/en/common.json`
- Test: `src/lib/modeloReport.test.ts` — add a case asserting `expectedCasillas("130", snapshot, ytd130)` returns the YTD figures (not the isolated-quarter estimate) when `ytd130` is passed.

**Interfaces:**
- Consumes: `expectedCasillas(modelo, snapshot, ytd130?)` → `CasillaExpectation[]` (`{ key, label, expected, informational? }`); `Modelo130Ytd`; `DeclarationSnapshot`; `formatEUR`.
- Produces: `<CasillaPrefill modelo={Modelo} snapshot={DeclarationSnapshot} ytd130={Modelo130Ytd | undefined} />`.

- [ ] **Step 1: Write the failing test**

In `src/lib/modeloReport.test.ts`:
```ts
it("expectedCasillas('130') uses the YTD figures when ytd130 is passed", () => {
  const snapshot = buildDeclarationSnapshot([invoice({ subtotal: 1000 })], []);
  const ytd130 = {
    rendimientoNetoYtd: 5000,
    gastosDificilJustificacion: 250,
    priorPagosFraccionados: 300,
    pagoFraccionado: 640,
  };
  const rows = expectedCasillas("130", snapshot, ytd130);
  expect(rows.find((r) => r.key === "rendimientoNeto")?.expected).toBe(5000);
  expect(rows.find((r) => r.key === "pagoFraccionado")?.expected).toBe(640);
});
```

- [ ] **Step 2: Run it**

Run: `bun run test src/lib/modeloReport.test.ts`
Expected: PASS if the behaviour already exists (it does — this is a regression guard for the reused function). If it fails, the reuse contract for #38 is broken — fix `expectedCasillas` before continuing.

- [ ] **Step 3: Build `CasillaPrefill.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "@phosphor-icons/react";
import { expectedCasillas, type Modelo, type Modelo130Ytd } from "../lib/modeloReport";
import type { DeclarationSnapshot } from "../lib/quarterlyDeclaration";
import { formatEUR } from "../lib/format";

/** Read-only "type these into AEAT" helper: AutoMono's own computed value for each casilla it can
 * derive, per modelo. Never authoritative — the disclaimer says to check against your own records.
 * Reuses `expectedCasillas`, the same function the upload-review flow compares against (#38). */
export function CasillaPrefill({
  modelo,
  snapshot,
  ytd130,
}: {
  modelo: Modelo;
  snapshot: DeclarationSnapshot;
  ytd130?: Modelo130Ytd;
}) {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const rows = expectedCasillas(modelo, snapshot, ytd130);

  async function copy(key: string, value: number) {
    await navigator.clipboard.writeText(String(value.toFixed(2)));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">
        {t("declarations.prefill.title", { modelo })}
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1.5">
                {r.label}
                {r.informational && ` · ${t("declarations.prefill.informational")}`}
              </td>
              <td className="py-1.5 text-right font-mono">{formatEUR(r.expected)}</td>
              <td className="py-1.5 pl-2 text-right">
                <button
                  onClick={() => void copy(r.key, r.expected)}
                  className="text-ink-soft hover:text-ink cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  aria-label={t("declarations.prefill.copy")}
                >
                  {copiedKey === r.key ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-soft mt-2">{t("declarations.prefill.disclaimer")}</p>
    </div>
  );
}
```
(Confirm the icon names against `@phosphor-icons/react` usage elsewhere — `Copy`, `Check`, `CheckCircle` are all used in the repo.)

- [ ] **Step 4: Wire into `ResumenTrimestral.tsx`**

In the declaration-detail "Modelos" `Card` (or directly below it), for each `modelo` in `activeModelos` render:
```tsx
<CasillaPrefill
  modelo={modelo}
  snapshot={declaration.snapshot}
  ytd130={
    modelo === "130"
      ? cumulativeModelo130(invoices, ytdExpenses, declaration.year, declaration.quarter as 1 | 2 | 3 | 4, declaration.gdjRate)
      : undefined
  }
/>
```
Show it for both `in_progress` and `completed` declarations (the detail view exists for both).

- [ ] **Step 5: i18n**

`es`:
- `declarations.prefill.title` = `"Casillas para el Modelo {{modelo}}"`
- `declarations.prefill.copy` = `"Copiar valor"`
- `declarations.prefill.informational` = `"informativo"`
- `declarations.prefill.disclaimer` = `"Valores calculados por AutoMono a partir de tus datos. Contrástalos con tus registros antes de presentar el modelo en la Sede Electrónica de la AEAT."`

`en`:
- `declarations.prefill.title` = `"Boxes for Modelo {{modelo}}"`
- `declarations.prefill.copy` = `"Copy value"`
- `declarations.prefill.informational` = `"informational"`
- `declarations.prefill.disclaimer` = `"Values computed by AutoMono from your data. Check them against your own records before filing the modelo on the AEAT website."`

- [ ] **Step 6: Typecheck + test + commit**

Run: `bun run test src/lib/modeloReport.test.ts` → PASS.
Run: `bun run build` → PASS.
```bash
git add src/components/CasillaPrefill.tsx src/screens/ResumenTrimestral.tsx src/lib/modeloReport.test.ts src/locales
git commit -m "feat(#38): AEAT casilla pre-fill panel on the declaration detail"
```

---

## Final Validation (before flipping the PR to ready-for-review)

- [ ] `bun run lint` — clean
- [ ] `bun run test` — full suite green
- [ ] `bun run test src/lib/quarterlyDeclaration.test.ts src/lib/modeloReport.test.ts src/db/migrations.test.ts` — the touched specs
- [ ] `bun run build` — tsc + vite build clean (this is the typecheck)
- [ ] `cd src-tauri && cargo test` — Rust touched (migrations 36 + 37); the `all_sql_files_are_registered_as_migrations` guard must pass
- [ ] **Manual (needs `bun run tauri dev` — flag to the user, can't run headless):**
  - Ajustes → toggle "Criterio de caja" on; confirm it persists across a restart.
  - Resumen Trimestral projection KPIs change when an issued-but-unpaid invoice drops out under cash basis; the BasisNote reads "Criterio de caja".
  - Run the declaration wizard under cash basis; step 1 shows the note; created snapshot's detail shows "Criterio de caja".
  - A pre-existing frozen declaration still shows "Criterio de devengo" (fallback).
  - Declaration detail shows the casilla pre-fill table per active modelo; copy button copies the value; disclaimer present.
  - Add an expense with a payment date in a different quarter; under cash basis it moves quarters.

## Risks / Rollback

- **Migrations (0036, 0037):** both are additive `ADD COLUMN` with default/nullable — safe, no data copy. Must be registered in `all_migrations()` in `src-tauri/src/lib.rs` in order or they silently never run in production. The `all_sql_files_are_registered_as_migrations` test is the guard — keep green. Rollback = revert the PR; the columns are harmless if left (unused when `criterio_caja = 0`).
- **`buildDeclarationSnapshot` signature change:** third param is defaulted (`= "accrual"`), so every existing 2-arg call site is unaffected. Grep confirms callers: `declarations.ts`, `DeclarationWizard.tsx`, `modeloReport.ts` (×2), `ResumenTrimestral.tsx` (×2), tests.
- **`currentSnapshot` may go sync→async:** its only callers (`getDeclaration`, `listDeclarations`) are already async — low risk, covered by `declarations.test.ts`.
- **Frozen snapshots:** never recomputed; `completed` branch of `currentSnapshot` is untouched. Pre-#2 snapshots with no `basis` key render as `"accrual"` via `?? "accrual"` at the call sites.
- **Tax math stays in `src/lib/`** — no Rust logic added, only migration registration. ✅
- **Design constraints:** no new accent color, no new motion, no responsive code. `BasisNote` / `CasillaPrefill` use existing `Tooltip` / `Badge` / table patterns. ✅
- **Invoice immutability triggers (`0008_invoice_lock.sql`):** untouched — no invoice schema change.
