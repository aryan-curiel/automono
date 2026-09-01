# Expense "Declared" Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any expense carry a `declared` boolean — set automatically when the quarterly declaration containing it is completed, and toggleable by hand from the Gastos list/detail screens — with no restriction on editing/deleting a declared expense.

**Architecture:** One new non-null boolean column on `expenses` (`declared`, default 0). `markDeclarationCompleted` (in `src/db/declarations.ts`) flags every expense in the declaration's frozen snapshot the moment it completes. The manual toggle reuses the existing generic `updateExpense(id, patch)` path — no new backend function needed for it. A `success`-tone `Badge` surfaces the flag in `Gastos.tsx`'s list and `GastoDetalle.tsx`'s header; a `MenuItem` in each screen's existing action menu flips it.

**Tech Stack:** Tauri 2 (Rust) + React 19 + TypeScript + SQLite (`@tauri-apps/plugin-sql`), Vitest, `cargo test`.

## Global Constraints

- Migrations are numbered sequentially in `src-tauri/migrations/NNNN_description.sql` and MUST be registered in `all_migrations()` in `src-tauri/src/lib.rs` — a file that exists on disk but isn't listed there silently never runs in production. The `all_sql_files_are_registered_as_migrations` Rust test guards this; keep it green.
- Business logic (tax math, formatting) lives in `src/lib/`/`src/features/*/`, not in Rust — this feature adds no new Rust code at all.
- i18n via `react-i18next`; `src/screens/GastoForm.tsx`, `Gastos.tsx`, and `GastoDetalle.tsx` are fully `t()`-driven — new strings MUST go through `src/locales/{es,en}/common.json`, not be hardcoded.
- Package manager is `bun`. Frontend tests: `bun run test` (or a single file: `bun run test <path>`). Rust tests: `cd src-tauri && cargo test`. Typecheck: `bun run build` (runs `tsc`).
- For UI changes, verify manually via `bun run tauri dev` before calling the work done — type-checking and unit tests verify correctness, not that the feature actually works end-to-end in the app.
- Declared expenses are NOT locked against edit/delete — the flag is informational only (per the approved design spec, `docs/superpowers/specs/2026-08-11-expense-declared-flag-design.md`).

---

## File Structure

| File                                                                                                         | Responsibility                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src-tauri/migrations/0029_expense_declared.sql` (new)                                                       | Adds `declared` boolean column to `expenses`                                   |
| `src-tauri/src/lib.rs` (modify)                                                                              | Registers migration 0029                                                       |
| `src/db/expenses.ts` (modify)                                                                                | `ExpenseRecord`/`ExpenseRow`/`NewExpense` gain `declared`; CRUD wiring         |
| `src/lib/analytics.test.ts`, `src/lib/quarterlyDeclaration.test.ts`, `src/lib/modeloReport.test.ts` (modify) | Fixture fixes so `ExpenseRecord`-typed test helpers still compile              |
| `src/screens/GastoForm.tsx` (modify)                                                                         | Preserves `declared` across create/edit saves (no form field)                  |
| `src/db/declarations.ts` (modify)                                                                            | `markDeclarationCompleted` flags every expense in the frozen snapshot          |
| `src/db/declarations.test.ts` (modify)                                                                       | Test for the flagging SQL                                                      |
| `src/locales/es/common.json`, `src/locales/en/common.json` (modify)                                          | New `expenses.declaredBadge`, `expenses.actions.markDeclared`/`unmarkDeclared` |
| `src/screens/Gastos.tsx` (modify)                                                                            | Declared badge + toggle menu item in the list row                              |
| `src/screens/GastoDetalle.tsx` (modify)                                                                      | Declared badge + toggle menu item in the detail header                         |

---

### Task 1: Schema migration

**Files:**

- Create: `src-tauri/migrations/0029_expense_declared.sql`
- Modify: `src-tauri/src/lib.rs:184-190` (append a new `Migration` entry after version 27, before the closing `]`)

**Interfaces:**

- Produces: `expenses.declared INTEGER NOT NULL DEFAULT 0` — consumed by Task 2 (`src/db/expenses.ts`) and Task 3 (`src/db/declarations.ts`).

- [ ] **Step 1: Create the migration file**

```sql
-- Marks an expense as already filed with Hacienda — set automatically when the quarterly
-- declaration it belongs to is completed, or toggled by hand independent of any declaration.
ALTER TABLE expenses ADD COLUMN declared INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register it in `all_migrations()`**

In `src-tauri/src/lib.rs`, the list currently ends with:

```rust
        Migration {
            version: 27,
            description: "reta_start_date",
            sql: include_str!("../migrations/0028_reta_start_date.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
```

Change it to:

```rust
        Migration {
            version: 27,
            description: "reta_start_date",
            sql: include_str!("../migrations/0028_reta_start_date.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "expense_declared",
            sql: include_str!("../migrations/0029_expense_declared.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
```

- [ ] **Step 3: Verify the registration guard and the frontend migration replay both pass**

Run: `cd src-tauri && cargo test all_sql_files_are_registered_as_migrations`
Expected: PASS

Run: `bun run test src/db/migrations.test.ts`
Expected: PASS (re-scans the `migrations/` directory independently and replays every `.sql` file against an in-memory DB)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/migrations/0029_expense_declared.sql src-tauri/src/lib.rs
git commit -m "feat: add declared column to expenses"
```

---

### Task 2: `src/db/expenses.ts` field wiring + `GastoForm.tsx` passthrough

**Files:**

- Modify: `src/db/expenses.ts`
- Modify: `src/screens/GastoForm.tsx`
- Modify: `src/lib/analytics.test.ts`, `src/lib/quarterlyDeclaration.test.ts`, `src/lib/modeloReport.test.ts` (fixture helpers — required for these to typecheck)

**Interfaces:**

- Consumes: `expenses.declared` column from Task 1.
- Produces: `ExpenseRecord.declared: boolean`, `NewExpense.declared: boolean` — consumed by Task 3 (`declarations.ts`), Task 5 (`Gastos.tsx`), Task 6 (`GastoDetalle.tsx`).

- [ ] **Step 1: Add `declared` to `ExpenseRecord`/`ExpenseRow`**

In `src/db/expenses.ts`, replace lines 6-35:

```ts
export interface ExpenseRecord {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  ivaAmount: number | null;
  deductiblePct: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  receiptFilePath: string | null;
  /** Quarter ("YYYY-QN") to declare this expense in, if different from the quarter of `date`. */
  declaredPeriod: string | null;
}

export type NewExpense = Omit<ExpenseRecord, "id">;

interface ExpenseRow {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  iva_amount: number | null;
  deductible_pct: number;
  irpf_rate: number | null;
  irpf_amount: number | null;
  receipt_file_path: string | null;
  declared_period: string | null;
}
```

with:

```ts
export interface ExpenseRecord {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  ivaAmount: number | null;
  deductiblePct: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  receiptFilePath: string | null;
  /** Quarter ("YYYY-QN") to declare this expense in, if different from the quarter of `date`. */
  declaredPeriod: string | null;
  /** True once this expense has been filed — auto-set when its quarterly declaration completes,
   * or toggled by hand independent of any declaration. Informational only; does not restrict
   * editing/deleting the expense. */
  declared: boolean;
}

export type NewExpense = Omit<ExpenseRecord, "id">;

interface ExpenseRow {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  iva_amount: number | null;
  deductible_pct: number;
  irpf_rate: number | null;
  irpf_amount: number | null;
  receipt_file_path: string | null;
  declared_period: string | null;
  declared: number;
}
```

- [ ] **Step 2: Map the new column in `mapRow`**

Replace lines 37-51:

```ts
function mapRow(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    deductiblePct: row.deductible_pct,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    receiptFilePath: row.receipt_file_path,
    declaredPeriod: row.declared_period,
  };
}
```

with:

```ts
function mapRow(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    deductiblePct: row.deductible_pct,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    receiptFilePath: row.receipt_file_path,
    declaredPeriod: row.declared_period,
    declared: !!row.declared,
  };
}
```

- [ ] **Step 3: Insert the new column in `createExpense`**

Replace lines 101-122:

```ts
export async function createExpense(input: NewExpense): Promise<ExpenseRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, irpf_rate, irpf_amount, receipt_file_path, declared_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.date,
      input.category,
      input.description,
      input.amount,
      input.ivaAmount,
      input.deductiblePct,
      input.irpfRate,
      input.irpfAmount,
      input.receiptFilePath,
      input.declaredPeriod,
    ],
  );
  const created = await getExpense(result.lastInsertId!);
  if (!created) throw new Error("Failed to load expense after insert");
  return created;
}
```

with:

```ts
export async function createExpense(input: NewExpense): Promise<ExpenseRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, irpf_rate, irpf_amount, receipt_file_path, declared_period, declared)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.date,
      input.category,
      input.description,
      input.amount,
      input.ivaAmount,
      input.deductiblePct,
      input.irpfRate,
      input.irpfAmount,
      input.receiptFilePath,
      input.declaredPeriod,
      input.declared ? 1 : 0,
    ],
  );
  const created = await getExpense(result.lastInsertId!);
  if (!created) throw new Error("Failed to load expense after insert");
  return created;
}
```

- [ ] **Step 4: Add `declared` to `COLUMN_BY_KEY`**

Replace lines 124-135:

```ts
const COLUMN_BY_KEY: Record<keyof NewExpense, string> = {
  date: "date",
  category: "category",
  description: "description",
  amount: "amount",
  ivaAmount: "iva_amount",
  deductiblePct: "deductible_pct",
  irpfRate: "irpf_rate",
  irpfAmount: "irpf_amount",
  receiptFilePath: "receipt_file_path",
  declaredPeriod: "declared_period",
};
```

with:

```ts
const COLUMN_BY_KEY: Record<keyof NewExpense, string> = {
  date: "date",
  category: "category",
  description: "description",
  amount: "amount",
  ivaAmount: "iva_amount",
  deductiblePct: "deductible_pct",
  irpfRate: "irpf_rate",
  irpfAmount: "irpf_amount",
  receiptFilePath: "receipt_file_path",
  declaredPeriod: "declared_period",
  declared: "declared",
};
```

- [ ] **Step 5: Preserve `declared` across `GastoForm.tsx` saves**

`NewExpense` gained a required `declared` field, so `GastoForm.tsx`'s save payload needs one. There's no form field for it (not user-editable at creation time per the design spec) — track the loaded expense's current value in state instead.

In `src/screens/GastoForm.tsx`, replace line 118:

```tsx
const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
```

with:

```tsx
const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
const [declared, setDeclared] = useState(false);
```

Replace lines 138-145:

```tsx
getExpense(expenseId).then((expense) => {
  if (cancelled) return;
  if (expense) {
    setIrpfAutoManaged(expense.irpfAmount === null);
    setForm(toFormState(expense));
  }
});
```

with:

```tsx
getExpense(expenseId).then((expense) => {
  if (cancelled) return;
  if (expense) {
    setIrpfAutoManaged(expense.irpfAmount === null);
    setDeclared(expense.declared);
    setForm(toFormState(expense));
  }
});
```

Replace lines 283-294:

```tsx
const payload: NewExpense = {
  date: form.date,
  category: form.category.trim() || null,
  description: form.description.trim() || null,
  amount: Number(form.amount),
  ivaAmount: form.ivaAmount.trim() ? Number(form.ivaAmount) : null,
  deductiblePct: form.deductiblePct.trim() ? Number(form.deductiblePct) : 100,
  irpfRate: form.irpfRate.trim() ? Number(form.irpfRate) : null,
  irpfAmount: irpfAmountDisplay.trim() ? Number(irpfAmountDisplay) : null,
  receiptFilePath: form.receiptFilePath,
  declaredPeriod: form.declaredPeriod || null,
};
```

with:

```tsx
const payload: NewExpense = {
  date: form.date,
  category: form.category.trim() || null,
  description: form.description.trim() || null,
  amount: Number(form.amount),
  ivaAmount: form.ivaAmount.trim() ? Number(form.ivaAmount) : null,
  deductiblePct: form.deductiblePct.trim() ? Number(form.deductiblePct) : 100,
  irpfRate: form.irpfRate.trim() ? Number(form.irpfRate) : null,
  irpfAmount: irpfAmountDisplay.trim() ? Number(irpfAmountDisplay) : null,
  receiptFilePath: form.receiptFilePath,
  declaredPeriod: form.declaredPeriod || null,
  declared,
};
```

- [ ] **Step 6: Fix the three now-broken test fixtures**

`ExpenseRecord` gained a required field, so every `Partial<ExpenseRecord>`-based test factory needs a default for it.

In `src/lib/analytics.test.ts`, replace lines 37-52:

```ts
function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-01-10",
    category: "Software",
    description: null,
    amount: 50,
    ivaAmount: null,
    deductiblePct: 100,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    ...overrides,
  };
}
```

with:

```ts
function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-01-10",
    category: "Software",
    description: null,
    amount: 50,
    ivaAmount: null,
    deductiblePct: 100,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    declared: false,
    ...overrides,
  };
}
```

In `src/lib/quarterlyDeclaration.test.ts`, replace lines 32-47 (the identical factory) the same way — add `declared: false,` right after `declaredPeriod: null,`.

In `src/lib/modeloReport.test.ts`, replace lines 32-47 (the identical factory) the same way — add `declared: false,` right after `declaredPeriod: null,`.

- [ ] **Step 7: Run typecheck and the test suite**

Run: `bun run build`
Expected: PASS, no TS errors.

Run: `bun run test`
Expected: PASS (all existing tests, including the three fixture files, still green).

- [ ] **Step 8: Commit**

```bash
git add src/db/expenses.ts src/screens/GastoForm.tsx src/lib/analytics.test.ts src/lib/quarterlyDeclaration.test.ts src/lib/modeloReport.test.ts
git commit -m "feat: wire declared through the expenses data layer"
```

---

### Task 3: Auto-flag expenses when a declaration completes

**Files:**

- Modify: `src/db/declarations.ts`
- Modify: `src/db/declarations.test.ts`

**Interfaces:**

- Consumes: `expenses.declared` column (Task 1), `DeclarationExpenseLine.id` (already exists in `src/lib/quarterlyDeclaration.ts`).

- [ ] **Step 1: Write the failing test**

In `src/db/declarations.test.ts`, add this `describe` block after the existing `deleteDeclaration guard` block (after line 43):

```ts
// Mirrors markDeclarationCompleted's own flagging UPDATE — run directly against the migrated
// schema since getDb() needs the Tauri runtime and isn't available under vitest.
describe("markDeclarationCompleted expense flagging", () => {
  it("flags only the expenses whose ids are in the completed snapshot", () => {
    const db = freshDb();
    db.exec(`INSERT INTO expenses (id, date, amount) VALUES (1, '2026-04-01', 50)`);
    db.exec(`INSERT INTO expenses (id, date, amount) VALUES (2, '2026-04-02', 30)`);
    db.prepare("UPDATE expenses SET declared = 1 WHERE id IN (?)").run(1);
    const rows = db.prepare("SELECT id, declared FROM expenses ORDER BY id").all();
    expect(rows).toEqual([
      { id: 1, declared: 1 },
      { id: 2, declared: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it passes against the mirrored SQL**

Run: `bun run test src/db/declarations.test.ts`
Expected: PASS — this test only exercises the migrated schema directly (same pattern as the existing `deleteDeclaration guard` tests in this file), so it passes before touching `declarations.ts`. It exists to lock in the exact SQL shape `markDeclarationCompleted` will use next.

- [ ] **Step 3: Implement the flagging in `markDeclarationCompleted`**

In `src/db/declarations.ts`, replace lines 163-175:

```ts
/** Marks a declaration completed. Throws if any of the three Modelo PDFs hasn't been attached yet. */
export async function markDeclarationCompleted(id: number): Promise<void> {
  const declaration = await getDeclaration(id);
  if (!declaration) throw new Error("Declaration not found");
  if (!declaration.modelo303Path || !declaration.modelo130Path || !declaration.modelo111Path) {
    throw new Error("All three Modelo PDFs (303, 130, 111) must be attached before completing");
  }
  const db = await getDb();
  await db.execute(
    "UPDATE quarterly_declarations SET status = 'completed', completed_at = datetime('now') WHERE id = $1",
    [id],
  );
}
```

with:

```ts
/** Marks a declaration completed. Throws if any of the three Modelo PDFs hasn't been attached yet.
 * Also flags every expense in the frozen snapshot as declared, so Gastos reflects what was
 * actually filed regardless of any `declared_period` override used to build that snapshot. */
export async function markDeclarationCompleted(id: number): Promise<void> {
  const declaration = await getDeclaration(id);
  if (!declaration) throw new Error("Declaration not found");
  if (!declaration.modelo303Path || !declaration.modelo130Path || !declaration.modelo111Path) {
    throw new Error("All three Modelo PDFs (303, 130, 111) must be attached before completing");
  }
  const db = await getDb();
  await db.execute(
    "UPDATE quarterly_declarations SET status = 'completed', completed_at = datetime('now') WHERE id = $1",
    [id],
  );
  const expenseIds = declaration.snapshot.expenses.map((e) => e.id);
  if (expenseIds.length > 0) {
    const placeholders = expenseIds.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`UPDATE expenses SET declared = 1 WHERE id IN (${placeholders})`, expenseIds);
  }
}
```

- [ ] **Step 4: Run typecheck and the full test file**

Run: `bun run build`
Expected: PASS.

Run: `bun run test src/db/declarations.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/db/declarations.ts src/db/declarations.test.ts
git commit -m "feat: flag declared expenses when a quarterly declaration completes"
```

---

### Task 4: i18n labels

**Files:**

- Modify: `src/locales/es/common.json:311-379`
- Modify: `src/locales/en/common.json:311-379`

**Interfaces:**

- Produces: `expenses.declaredBadge`, `expenses.actions.markDeclared`, `expenses.actions.unmarkDeclared` — consumed by Task 5 and Task 6.

- [ ] **Step 1: Add the Spanish strings**

In `src/locales/es/common.json`, replace:

```json
  "expenses": {
    "title": "Gastos",
    "subtitleCount": "{{count}} gastos",
    "newExpense": "Nuevo gasto",
    "editExpense": "Editar gasto",
```

with:

```json
  "expenses": {
    "title": "Gastos",
    "subtitleCount": "{{count}} gastos",
    "newExpense": "Nuevo gasto",
    "editExpense": "Editar gasto",
    "declaredBadge": "Declarada",
```

And replace:

```json
    "actions": {
      "save": "Guardar",
      "saving": "Guardando…",
      "cancel": "Cancelar",
      "delete": "Eliminar",
      "edit": "Editar",
      "attachFile": "Adjuntar archivo",
      "attaching": "Adjuntando…",
      "openFile": "Abrir archivo",
      "confirmDelete": "¿Eliminar este gasto? Esta acción no se puede deshacer."
    },
```

with:

```json
    "actions": {
      "save": "Guardar",
      "saving": "Guardando…",
      "cancel": "Cancelar",
      "delete": "Eliminar",
      "edit": "Editar",
      "attachFile": "Adjuntar archivo",
      "attaching": "Adjuntando…",
      "openFile": "Abrir archivo",
      "markDeclared": "Marcar como declarada",
      "unmarkDeclared": "Marcar como no declarada",
      "confirmDelete": "¿Eliminar este gasto? Esta acción no se puede deshacer."
    },
```

- [ ] **Step 2: Add the English strings**

In `src/locales/en/common.json`, replace:

```json
  "expenses": {
    "title": "Expenses",
    "subtitleCount": "{{count}} expenses",
    "newExpense": "New expense",
    "editExpense": "Edit expense",
```

with:

```json
  "expenses": {
    "title": "Expenses",
    "subtitleCount": "{{count}} expenses",
    "newExpense": "New expense",
    "editExpense": "Edit expense",
    "declaredBadge": "Declared",
```

And replace:

```json
    "actions": {
      "save": "Save",
      "saving": "Saving…",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "attachFile": "Attach file",
      "attaching": "Attaching…",
      "openFile": "Open file",
      "confirmDelete": "Delete this expense? This action cannot be undone."
    },
```

with:

```json
    "actions": {
      "save": "Save",
      "saving": "Saving…",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "attachFile": "Attach file",
      "attaching": "Attaching…",
      "openFile": "Open file",
      "markDeclared": "Mark as declared",
      "unmarkDeclared": "Mark as not declared",
      "confirmDelete": "Delete this expense? This action cannot be undone."
    },
```

- [ ] **Step 3: Verify both JSON files still parse and the app boots**

Run: `bun run build`
Expected: PASS (Vite/tsc would fail on invalid JSON imported as a module).

- [ ] **Step 4: Commit**

```bash
git add src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: add i18n labels for the expense declared flag"
```

---

### Task 5: `Gastos.tsx` — declared badge + toggle

**Files:**

- Modify: `src/screens/Gastos.tsx`

**Interfaces:**

- Consumes: `ExpenseRecord.declared` (Task 2), `updateExpense` (Task 2), `expenses.declaredBadge`/`expenses.actions.markDeclared`/`unmarkDeclared` (Task 4).

- [ ] **Step 1: Import `updateExpense`**

Replace line 11:

```tsx
import { listExpenses } from "../db/expenses";
```

with:

```tsx
import { listExpenses, updateExpense } from "../db/expenses";
```

- [ ] **Step 2: Add the toggle handler**

Replace lines 31-35:

```tsx
function retry() {
  setLoading(true);
  setLoadError(false);
  setReloadToken((n) => n + 1);
}
```

with:

```tsx
function retry() {
  setLoading(true);
  setLoadError(false);
  setReloadToken((n) => n + 1);
}

async function toggleDeclared(expense: ExpenseRecord) {
  await updateExpense(expense.id, { declared: !expense.declared });
  setReloadToken((n) => n + 1);
}
```

- [ ] **Step 3: Show the badge and add the menu item**

Replace lines 145-170:

```tsx
              <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>
              <div>{e.category && <Badge tone="neutral">{e.category}</Badge>}</div>
              <div className="font-medium text-[13.5px]">{e.description}</div>
              <div className="font-medium text-[13px] font-mono text-right">
                {formatEUR(e.amount * (e.deductiblePct / 100))}
              </div>
              <div className="font-semibold text-[13.5px] font-mono text-right">
                {formatEUR(e.amount)}
              </div>
              <div className="font-medium text-[13px] font-mono text-ink-soft text-right">
                {formatEUR(e.ivaAmount ?? 0)}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                onClick={(e2) => e2.stopPropagation()}
              >
                <Menu>
                  <MenuTrigger className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer">
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => onOpenExpense(e.id)}>{t("common.viewDetail")}</MenuItem>
                  </MenuContent>
                </Menu>
              </div>
```

with:

```tsx
              <div className="text-[13px] text-ink-soft">{formatDate(e.date)}</div>
              <div className="flex items-center gap-1.5">
                {e.category && <Badge tone="neutral">{e.category}</Badge>}
                {e.declared && <Badge tone="success">{t("expenses.declaredBadge")}</Badge>}
              </div>
              <div className="font-medium text-[13.5px]">{e.description}</div>
              <div className="font-medium text-[13px] font-mono text-right">
                {formatEUR(e.amount * (e.deductiblePct / 100))}
              </div>
              <div className="font-semibold text-[13.5px] font-mono text-right">
                {formatEUR(e.amount)}
              </div>
              <div className="font-medium text-[13px] font-mono text-ink-soft text-right">
                {formatEUR(e.ivaAmount ?? 0)}
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                onClick={(e2) => e2.stopPropagation()}
              >
                <Menu>
                  <MenuTrigger className="p-1.5 rounded-control hover:bg-surface-alt cursor-pointer">
                    <DotsThreeVertical size={16} weight="bold" />
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => onOpenExpense(e.id)}>{t("common.viewDetail")}</MenuItem>
                    <MenuItem onSelect={() => toggleDeclared(e)}>
                      {e.declared
                        ? t("expenses.actions.unmarkDeclared")
                        : t("expenses.actions.markDeclared")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
```

- [ ] **Step 4: Typecheck**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `bun run tauri dev`

Open Gastos. Open the row menu for any expense and select "Marcar como declarada" — confirm a green "Declarada" badge appears next to the category badge. Reopen the menu and select "Marcar como no declarada" — confirm the badge disappears.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Gastos.tsx
git commit -m "feat: show and toggle the declared flag in the Gastos list"
```

---

### Task 6: `GastoDetalle.tsx` — declared badge + toggle

**Files:**

- Modify: `src/screens/GastoDetalle.tsx`

**Interfaces:**

- Consumes: `ExpenseRecord.declared` (Task 2), `updateExpense` (Task 2), `expenses.declaredBadge`/`expenses.actions.markDeclared`/`unmarkDeclared` (Task 4).

- [ ] **Step 1: Import `Badge` and `updateExpense`**

Replace lines 4-11:

```tsx
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { InfoRow } from "../components/ui/InfoRow";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { BackLink, PageHeader } from "../components/PageHeader";
import { deleteExpense, deleteExpenseFiles, getExpense, openExpenseFile } from "../db/expenses";
```

with:

```tsx
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText } from "../components/ui/Field";
import { InfoRow } from "../components/ui/InfoRow";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "../components/ui/Menu";
import { Sheet } from "../components/ui/Sheet";
import { BackLink, PageHeader } from "../components/PageHeader";
import {
  deleteExpense,
  deleteExpenseFiles,
  getExpense,
  openExpenseFile,
  updateExpense,
} from "../db/expenses";
```

- [ ] **Step 2: Add the toggle handler**

Replace lines 61-67:

```tsx
async function confirmDelete() {
  if (!expense) return;
  const filePaths = [expense.receiptFilePath].filter((p): p is string => !!p);
  await deleteExpenseFiles(filePaths);
  await deleteExpense(expense.id);
  onDeleted();
}
```

with:

```tsx
async function confirmDelete() {
  if (!expense) return;
  const filePaths = [expense.receiptFilePath].filter((p): p is string => !!p);
  await deleteExpenseFiles(filePaths);
  await deleteExpense(expense.id);
  onDeleted();
}

async function toggleDeclared() {
  if (!expense) return;
  await updateExpense(expense.id, { declared: !expense.declared });
  const updated = await getExpense(expense.id);
  if (updated) setExpense(updated);
}
```

- [ ] **Step 3: Show the badge in the header and add the menu item**

Replace lines 105-128:

```tsx
<PageHeader
  title={expense.description || expense.category || formatDate(expense.date)}
  subtitle={formatDate(expense.date)}
  actions={
    <>
      <Button variant="secondary" onClick={() => onEditExpense(expense.id)}>
        {t("expenses.actions.edit")}
      </Button>
      <Menu>
        <MenuTrigger
          className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
          aria-label={t("expenses.detail.moreActions")}
        >
          <DotsThreeVertical size={16} weight="bold" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem danger onSelect={() => setDeletePending(true)}>
            {t("expenses.actions.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  }
/>
```

with:

```tsx
<PageHeader
  title={
    <span className="flex items-center gap-2">
      {expense.description || expense.category || formatDate(expense.date)}
      {expense.declared && <Badge tone="success">{t("expenses.declaredBadge")}</Badge>}
    </span>
  }
  subtitle={formatDate(expense.date)}
  actions={
    <>
      <Button variant="secondary" onClick={() => onEditExpense(expense.id)}>
        {t("expenses.actions.edit")}
      </Button>
      <Menu>
        <MenuTrigger
          className="p-2 rounded-control hover:bg-surface-alt cursor-pointer"
          aria-label={t("expenses.detail.moreActions")}
        >
          <DotsThreeVertical size={16} weight="bold" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={toggleDeclared}>
            {expense.declared
              ? t("expenses.actions.unmarkDeclared")
              : t("expenses.actions.markDeclared")}
          </MenuItem>
          <MenuItem danger onSelect={() => setDeletePending(true)}>
            {t("expenses.actions.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  }
/>
```

- [ ] **Step 4: Typecheck**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `bun run tauri dev`

Open the expense toggled in Task 5's manual check — confirm the header shows the green "Declarada" badge next to the title. Use the "…" menu's "Marcar como no declarada" item — confirm the badge disappears immediately (no reload needed) and the row menu label flips back to "Marcar como declarada" the next time you open it.

- [ ] **Step 6: Commit**

```bash
git add src/screens/GastoDetalle.tsx
git commit -m "feat: show and toggle the declared flag in the expense detail view"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite and typecheck**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 2: Run the full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS (all existing tests, including `all_sql_files_are_registered_as_migrations` covering the new migration).

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: PASS, no new warnings.

- [ ] **Step 4: Final end-to-end walkthrough**

Run: `bun run tauri dev`

1. Create a new expense — confirm it saves with no "Declarada" badge (default false).
2. Toggle it declared from the Gastos list, then from the detail view, then back — confirm both surfaces stay in sync after each toggle (reopen the screen if needed to confirm persistence).
3. Open (or create, if none exists) a quarterly declaration containing at least one undeclared expense in `ResumenTrimestral`/`DeclaracionDetalle`, attach all three Modelo PDFs, and complete it — confirm every expense in that declaration's snapshot now shows the "Declarada" badge in Gastos, and an expense from a different quarter is untouched.

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), data layer + form passthrough (Task 2), automatic flagging on declaration completion (Task 3), i18n (Task 4), Gastos list toggle/badge (Task 5), detail view toggle/badge (Task 6) — every section of the design spec has a task. "Out of scope" items (locking, DeclaracionDetalle toggle, invoice mirror) are intentionally absent.
- **Type consistency:** `declared` (TS, boolean) ↔ `declared` (SQL, integer 0/1) mapped consistently via `!!row.declared` (Task 2) and `declared ? 1 : 0` (Task 2's `createExpense`, Task 3's snapshot-id UPDATE doesn't need the cast since it only ever writes `1`). `toggleDeclared` naming and `updateExpense(id, { declared })` call shape match between Task 5 and Task 6.
- **No placeholders:** every step has literal code, not a description of code.
