# Expense IRPF Retention Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any expense record carry an optional IRPF retention (rate % and amount €) withheld by the vendor (e.g. a Gestor), extract it from PDF receipts when present, and surface it as its own credit line in the quarterly tax summary.

**Architecture:** Two new nullable columns on `expenses` (`irpf_rate`, `irpf_amount`), mirroring the existing `invoices.irpf_rate`/`irpf_amount` columns but in the inverse direction (withheld *from* the user, not *by* the user's client). Extraction reuses `receipt_extract.rs`'s existing keyword-line-scan pattern. The form auto-computes amount from rate × base but allows manual override, matching how the vendor's own invoice may round.

**Tech Stack:** Tauri 2 (Rust) + React 19 + TypeScript + SQLite (`@tauri-apps/plugin-sql`), Vitest, `cargo test`.

## Global Constraints

- Migrations are numbered sequentially in `src-tauri/migrations/NNNN_description.sql` and MUST be registered in `all_migrations()` in `src-tauri/src/lib.rs` — a file that exists on disk but isn't listed there silently never runs in production. The `all_sql_files_are_registered_as_migrations` Rust test guards this; keep it green.
- Business logic (tax math, formatting) lives in `src/lib/`/`src/features/*/`, not in Rust — Rust here is IO/OS-boundary only (this feature adds no new Rust business logic beyond text extraction).
- i18n via `react-i18next`; `src/screens/GastoForm.tsx` and `GastoDetalle.tsx` are fully `t()`-driven (unlike `ResumenTrimestral.tsx`/invoice screens, which use hardcoded Spanish strings) — new expense-form/detail strings MUST go through `src/locales/{es,en}/common.json`, not be hardcoded.
- Package manager is `bun`. Frontend tests: `bun run test` (or a single file: `bun run test <path>`). Rust tests: `cd src-tauri && cargo test`. Typecheck: `bun run build` (runs `tsc`).
- For UI changes, verify manually via `bun run tauri dev` before calling the work done — type-checking and unit tests verify correctness, not that the feature actually works end-to-end in the app.

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/migrations/0022_expense_irpf_retention.sql` (new) | Adds `irpf_rate`, `irpf_amount` nullable columns to `expenses` |
| `src-tauri/src/lib.rs` (modify) | Registers migration 0022 |
| `src-tauri/src/receipt_extract.rs` (modify) | Extracts retention rate/amount from receipt PDF text |
| `src/db/expenses.ts` (modify) | `ExpenseRecord`/`ExpenseRow`/`ReceiptFields` gain the two fields; CRUD wiring |
| `src/lib/analytics.test.ts` (modify) | Fixture fix so `ExpenseRecord`-typed test helper still compiles |
| `src/locales/es/common.json`, `src/locales/en/common.json` (modify) | New `expenses.fields.irpfRate`/`irpfAmount` labels |
| `src/screens/GastoForm.tsx` (modify) | Rate/amount inputs, auto-compute, OCR autofill |
| `src/screens/GastoDetalle.tsx` (modify) | Read-only retention row |
| `src/screens/ResumenTrimestral.tsx` (modify) | New KPI tile + CSV columns |

---

### Task 1: Schema migration

**Files:**
- Create: `src-tauri/migrations/0022_expense_irpf_retention.sql`
- Modify: `src-tauri/src/lib.rs:145-150` (append a new `Migration` entry after the version-21 entry, before the closing `]`)

**Interfaces:**
- Produces: `expenses.irpf_rate REAL NULL`, `expenses.irpf_amount REAL NULL` — consumed by Task 3 (`src/db/expenses.ts`).

- [ ] **Step 1: Create the migration file**

```sql
ALTER TABLE expenses ADD COLUMN irpf_rate REAL;
ALTER TABLE expenses ADD COLUMN irpf_amount REAL;
```

- [ ] **Step 2: Register it in `all_migrations()`**

In `src-tauri/src/lib.rs`, the list currently ends with:

```rust
        Migration {
            version: 21,
            description: "expense_payment_proof",
            sql: include_str!("../migrations/0021_expense_payment_proof.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
```

Change it to:

```rust
        Migration {
            version: 21,
            description: "expense_payment_proof",
            sql: include_str!("../migrations/0021_expense_payment_proof.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "expense_irpf_retention",
            sql: include_str!("../migrations/0022_expense_irpf_retention.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
```

- [ ] **Step 3: Verify the registration guard and the frontend migration replay both pass**

Run: `cd src-tauri && cargo test all_sql_files_are_registered_as_migrations`
Expected: PASS

Run: `bun run test src/db/migrations.test.ts`
Expected: PASS (this test re-scans the `migrations/` directory independently and replays every `.sql` file against an in-memory DB — it will fail loudly if the new migration's SQL is invalid, even though it doesn't know about `all_migrations()`)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/migrations/0022_expense_irpf_retention.sql src-tauri/src/lib.rs
git commit -m "feat: add irpf_rate/irpf_amount columns to expenses"
```

---

### Task 2: Retention extraction in `receipt_extract.rs`

**Files:**
- Modify: `src-tauri/src/receipt_extract.rs`

**Interfaces:**
- Consumes: `parse_amount(raw: &str) -> Option<f64>` (existing, line 31), `last_number_on_line_containing(text: &str, keyword: &str) -> Option<f64>` (existing, line 51).
- Produces: `ReceiptFields.irpf_rate: Option<f64>`, `ReceiptFields.irpf_amount: Option<f64>` — consumed by Task 3's `ReceiptFieldsRow`/`extractReceiptFields` mapping in `src/db/expenses.ts`.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `#[cfg(test)] mod tests { ... }` block (after `last_number_on_line_containing_finds_the_amount_not_the_rate`, i.e. after line 144):

```rust
    #[test]
    fn last_percent_on_line_containing_finds_the_rate() {
        let text = "IVA (21%): 21,00\nRetencion IRPF (7%): -7,00";
        assert_eq!(last_percent_on_line_containing(text, "retenc"), Some(7.0));
        assert_eq!(last_percent_on_line_containing(text, "iva"), Some(21.0));
    }
```

And a new integration-style test, added after `extract_receipt_fields_reads_all_fields_from_a_real_pdf` (after line 173):

```rust
    #[test]
    fn extract_receipt_fields_reads_irpf_retention_from_a_real_pdf() {
        let out_path = std::env::temp_dir()
            .join(format!("automono_receipt_extract_irpf_test_{}.pdf", std::process::id()));
        let pdf = build_minimal_pdf(&[
            "Gestoria Lopez SL",
            "Fecha: 02/08/2026",
            "Subtotal: 100,00",
            "IVA (21%): 21,00",
            "Retencion IRPF (7%): -7,00",
            "Total: 114,00",
        ]);
        std::fs::write(&out_path, pdf).expect("write sample receipt pdf");

        let fields = extract_receipt_fields(&out_path);
        assert_eq!(fields.irpf_rate, Some(7.0));
        assert_eq!(fields.irpf_amount, Some(7.0));

        std::fs::remove_file(&out_path).ok();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test receipt_extract`
Expected: FAIL to compile — `last_percent_on_line_containing` doesn't exist yet, and `ReceiptFields` has no `irpf_rate`/`irpf_amount` fields.

- [ ] **Step 3: Add the `irpf_rate`/`irpf_amount` fields to `ReceiptFields`**

Replace lines 8-14:

```rust
#[derive(Serialize, Default, Debug, PartialEq)]
pub struct ReceiptFields {
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub iva_amount: Option<f64>,
    pub vendor_guess: Option<String>,
}
```

with:

```rust
#[derive(Serialize, Default, Debug, PartialEq)]
pub struct ReceiptFields {
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub iva_amount: Option<f64>,
    pub irpf_rate: Option<f64>,
    pub irpf_amount: Option<f64>,
    pub vendor_guess: Option<String>,
}
```

- [ ] **Step 4: Add the `last_percent_on_line_containing` helper**

Insert this after `last_number_on_line_containing` (after line 59, before `fn is_valid_date`):

```rust
/// Pulls a percentage rate (`7%`, `(7%)`, `-7%`) from the last line containing `keyword`, same
/// bottom-up "last matching line wins" logic as `last_number_on_line_containing`, applied to the
/// digits immediately preceding a `%` sign instead of the last number on the line.
fn last_percent_on_line_containing(text: &str, keyword: &str) -> Option<f64> {
    let keyword = keyword.to_lowercase();
    text.lines().filter(|line| line.to_lowercase().contains(&keyword)).rev().find_map(|line| {
        line.split('%').find_map(|before| {
            let digits: String =
                before.chars().rev().take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
            parse_amount(&digits.chars().rev().collect::<String>())
        })
    })
}
```

- [ ] **Step 5: Wire retention extraction into `extract_receipt_fields`, and guard vendor-guess against retention lines**

Replace line 97:

```rust
const NON_VENDOR_KEYWORDS: [&str; 5] = ["total", "iva", "fecha", "factura", "subtotal"];
```

with:

```rust
const NON_VENDOR_KEYWORDS: [&str; 7] = ["total", "iva", "fecha", "factura", "subtotal", "retenc", "irpf"];
```

Replace the `extract_receipt_fields` function (lines 112-120):

```rust
pub fn extract_receipt_fields(path: &Path) -> ReceiptFields {
    let text = extract_text(path);
    ReceiptFields {
        date: find_date(&text),
        amount: last_number_on_line_containing(&text, "total"),
        iva_amount: last_number_on_line_containing(&text, "iva"),
        vendor_guess: guess_vendor(&text),
    }
}
```

with:

```rust
pub fn extract_receipt_fields(path: &Path) -> ReceiptFields {
    let text = extract_text(path);
    let irpf_amount = last_number_on_line_containing(&text, "retenc")
        .or_else(|| last_number_on_line_containing(&text, "irpf"));
    let irpf_rate = last_percent_on_line_containing(&text, "retenc")
        .or_else(|| last_percent_on_line_containing(&text, "irpf"));
    ReceiptFields {
        date: find_date(&text),
        amount: last_number_on_line_containing(&text, "total"),
        iva_amount: last_number_on_line_containing(&text, "iva"),
        irpf_rate,
        irpf_amount,
        vendor_guess: guess_vendor(&text),
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test receipt_extract`
Expected: PASS — all tests in the module, including the two new ones and the two pre-existing tests that reference `ReceiptFields::default()`/full-field assertions (Default derive covers the new fields as `None` automatically, so those don't need edits).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/receipt_extract.rs
git commit -m "feat: extract IRPF retention rate/amount from receipt PDFs"
```

---

### Task 3: `src/db/expenses.ts` field wiring

**Files:**
- Modify: `src/db/expenses.ts`
- Modify: `src/lib/analytics.test.ts:37-50` (fixture helper — required for this to typecheck)

**Interfaces:**
- Consumes: `expenses.irpf_rate`/`irpf_amount` columns from Task 1; `ReceiptFields.irpf_rate`/`irpf_amount` (Rust, `snake_case`) from Task 2.
- Produces: `ExpenseRecord.irpfRate: number | null`, `ExpenseRecord.irpfAmount: number | null`, `ReceiptFields.irpfRate: number | null`, `ReceiptFields.irpfAmount: number | null` — consumed by Task 5 (`GastoForm.tsx`), Task 6 (`GastoDetalle.tsx`), Task 7 (`ResumenTrimestral.tsx`).

- [ ] **Step 1: Add the fields to `ExpenseRecord` and `ExpenseRow`**

In `src/db/expenses.ts`, replace lines 5-29:

```ts
export interface ExpenseRecord {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  ivaAmount: number | null;
  deductiblePct: number;
  receiptFilePath: string | null;
  paymentProofFilePath: string | null;
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
  receipt_file_path: string | null;
  payment_proof_file_path: string | null;
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
  paymentProofFilePath: string | null;
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
  payment_proof_file_path: string | null;
}
```

- [ ] **Step 2: Map the new columns in `mapRow`**

Replace lines 31-43:

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
    receiptFilePath: row.receipt_file_path,
    paymentProofFilePath: row.payment_proof_file_path,
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
    paymentProofFilePath: row.payment_proof_file_path,
  };
}
```

- [ ] **Step 3: Insert the new columns in `createExpense`**

Replace lines 76-95:

```ts
export async function createExpense(input: NewExpense): Promise<ExpenseRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, receipt_file_path, payment_proof_file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.date,
      input.category,
      input.description,
      input.amount,
      input.ivaAmount,
      input.deductiblePct,
      input.receiptFilePath,
      input.paymentProofFilePath,
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
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, irpf_rate, irpf_amount, receipt_file_path, payment_proof_file_path)
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
      input.paymentProofFilePath,
    ],
  );
  const created = await getExpense(result.lastInsertId!);
  if (!created) throw new Error("Failed to load expense after insert");
  return created;
}
```

- [ ] **Step 4: Add the new columns to `COLUMN_BY_KEY`**

Replace lines 97-106:

```ts
const COLUMN_BY_KEY: Record<keyof NewExpense, string> = {
  date: "date",
  category: "category",
  description: "description",
  amount: "amount",
  ivaAmount: "iva_amount",
  deductiblePct: "deductible_pct",
  receiptFilePath: "receipt_file_path",
  paymentProofFilePath: "payment_proof_file_path",
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
  paymentProofFilePath: "payment_proof_file_path",
};
```

- [ ] **Step 5: Add the new fields to `ReceiptFields`/`ReceiptFieldsRow` and their mapping**

Replace lines 157-180:

```ts
export interface ReceiptFields {
  date: string | null;
  amount: number | null;
  ivaAmount: number | null;
  vendorGuess: string | null;
}

interface ReceiptFieldsRow {
  date: string | null;
  amount: number | null;
  iva_amount: number | null;
  vendor_guess: string | null;
}

/** Best-effort field extraction from a PDF receipt's text layer; every field may be null. */
export async function extractReceiptFields(filePath: string): Promise<ReceiptFields> {
  const row = await invoke<ReceiptFieldsRow>("extract_receipt_fields_cmd", { filePath });
  return {
    date: row.date,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    vendorGuess: row.vendor_guess,
  };
}
```

with:

```ts
export interface ReceiptFields {
  date: string | null;
  amount: number | null;
  ivaAmount: number | null;
  irpfRate: number | null;
  irpfAmount: number | null;
  vendorGuess: string | null;
}

interface ReceiptFieldsRow {
  date: string | null;
  amount: number | null;
  iva_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  vendor_guess: string | null;
}

/** Best-effort field extraction from a PDF receipt's text layer; every field may be null. */
export async function extractReceiptFields(filePath: string): Promise<ReceiptFields> {
  const row = await invoke<ReceiptFieldsRow>("extract_receipt_fields_cmd", { filePath });
  return {
    date: row.date,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    vendorGuess: row.vendor_guess,
  };
}
```

- [ ] **Step 6: Fix the now-broken `analytics.test.ts` fixture**

`ExpenseRecord` gained two required fields, so the `expense()` test helper in `src/lib/analytics.test.ts` (lines 37-50) will fail to typecheck. Replace:

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
    receiptFilePath: null,
    paymentProofFilePath: null,
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
    paymentProofFilePath: null,
    ...overrides,
  };
}
```

- [ ] **Step 7: Run typecheck and the test suite**

Run: `bun run build`
Expected: PASS, no TS errors.

Run: `bun run test`
Expected: PASS (all existing tests, including `analytics.test.ts`, still green).

- [ ] **Step 8: Commit**

```bash
git add src/db/expenses.ts src/lib/analytics.test.ts
git commit -m "feat: wire irpfRate/irpfAmount through the expenses data layer"
```

---

### Task 4: i18n labels

**Files:**
- Modify: `src/locales/es/common.json:161-173`
- Modify: `src/locales/en/common.json:161-173`

**Interfaces:**
- Produces: `expenses.fields.irpfRate`, `expenses.fields.irpfAmount` translation keys — consumed by Task 5 and Task 6.

- [ ] **Step 1: Add the Spanish labels**

In `src/locales/es/common.json`, inside `expenses.fields`, replace:

```json
    "fields": {
      "date": "Fecha",
      "category": "Categoría",
      "description": "Descripción",
      "amount": "Importe",
      "ivaAmount": "Importe IVA",
      "deductiblePct": "% deducible",
      "file": "Factura / recibo",
```

with:

```json
    "fields": {
      "date": "Fecha",
      "category": "Categoría",
      "description": "Descripción",
      "amount": "Importe",
      "ivaAmount": "Importe IVA",
      "deductiblePct": "% deducible",
      "irpfRate": "% Retención IRPF",
      "irpfAmount": "Importe retenido",
      "file": "Factura / recibo",
```

- [ ] **Step 2: Add the English labels**

In `src/locales/en/common.json`, inside `expenses.fields`, replace:

```json
    "fields": {
      "date": "Date",
      "category": "Category",
      "description": "Description",
      "amount": "Amount",
      "ivaAmount": "VAT amount",
      "deductiblePct": "Deductible %",
      "file": "Invoice / receipt",
```

with:

```json
    "fields": {
      "date": "Date",
      "category": "Category",
      "description": "Description",
      "amount": "Amount",
      "ivaAmount": "VAT amount",
      "deductiblePct": "Deductible %",
      "irpfRate": "IRPF retention %",
      "irpfAmount": "Amount withheld",
      "file": "Invoice / receipt",
```

- [ ] **Step 3: Verify both JSON files still parse and the app boots**

Run: `bun run build`
Expected: PASS (Vite/tsc would fail on invalid JSON imported as a module).

- [ ] **Step 4: Commit**

```bash
git add src/locales/es/common.json src/locales/en/common.json
git commit -m "feat: add i18n labels for expense IRPF retention fields"
```

---

### Task 5: `GastoForm.tsx` — rate/amount inputs, auto-compute, OCR autofill

**Files:**
- Modify: `src/screens/GastoForm.tsx`

**Interfaces:**
- Consumes: `ExpenseRecord.irpfRate`/`irpfAmount`, `NewExpense.irpfRate`/`irpfAmount`, `ReceiptFields.irpfRate`/`irpfAmount` (all from Task 3).
- Produces: nothing new consumed elsewhere — this is a leaf UI task alongside Task 6.

- [ ] **Step 1: Import `useRef`**

Replace line 1:

```tsx
import { useEffect, useState } from "react";
```

with:

```tsx
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Add the fields to `FormState`, `emptyForm`, and `toFormState`**

Replace lines 28-63:

```tsx
interface FormState {
  date: string;
  category: string;
  description: string;
  amount: string;
  ivaAmount: string;
  deductiblePct: string;
  receiptFilePath: string | null;
  paymentProofFilePath: string | null;
}

function emptyForm(): FormState {
  return {
    date: "",
    category: "",
    description: "",
    amount: "",
    ivaAmount: "",
    deductiblePct: "100",
    receiptFilePath: null,
    paymentProofFilePath: null,
  };
}

function toFormState(expense: ExpenseRecord): FormState {
  return {
    date: expense.date,
    category: expense.category ?? "",
    description: expense.description ?? "",
    amount: String(expense.amount),
    ivaAmount: expense.ivaAmount !== null ? String(expense.ivaAmount) : "",
    deductiblePct: String(expense.deductiblePct),
    receiptFilePath: expense.receiptFilePath,
    paymentProofFilePath: expense.paymentProofFilePath,
  };
}
```

with:

```tsx
interface FormState {
  date: string;
  category: string;
  description: string;
  amount: string;
  ivaAmount: string;
  deductiblePct: string;
  irpfRate: string;
  irpfAmount: string;
  receiptFilePath: string | null;
  paymentProofFilePath: string | null;
}

function emptyForm(): FormState {
  return {
    date: "",
    category: "",
    description: "",
    amount: "",
    ivaAmount: "",
    deductiblePct: "100",
    irpfRate: "",
    irpfAmount: "",
    receiptFilePath: null,
    paymentProofFilePath: null,
  };
}

function toFormState(expense: ExpenseRecord): FormState {
  return {
    date: expense.date,
    category: expense.category ?? "",
    description: expense.description ?? "",
    amount: String(expense.amount),
    ivaAmount: expense.ivaAmount !== null ? String(expense.ivaAmount) : "",
    deductiblePct: String(expense.deductiblePct),
    irpfRate: expense.irpfRate !== null ? String(expense.irpfRate) : "",
    irpfAmount: expense.irpfAmount !== null ? String(expense.irpfAmount) : "",
    receiptFilePath: expense.receiptFilePath,
    paymentProofFilePath: expense.paymentProofFilePath,
  };
}
```

- [ ] **Step 3: Add the auto-compute ref and effect**

Replace lines 77-104 (from `const [attachingProof, ...]` through the end of the edit-load `useEffect`):

```tsx
  const [attachingProof, setAttachingProof] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);

  useEffect(() => {
    listExpenseCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || expenseId === undefined) return;
    let cancelled = false;
    getExpense(expenseId)
      .then((expense) => {
        if (cancelled) return;
        if (expense) setForm(toFormState(expense));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, expenseId]);
```

with:

```tsx
  const [attachingProof, setAttachingProof] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  // Tracks whether irpfAmount should keep auto-recomputing from rate × amount, or has been
  // taken over by a manual/OCR-extracted value it shouldn't clobber.
  const irpfAutoManaged = useRef(true);

  useEffect(() => {
    listExpenseCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || expenseId === undefined) return;
    let cancelled = false;
    getExpense(expenseId)
      .then((expense) => {
        if (cancelled) return;
        if (expense) {
          irpfAutoManaged.current = expense.irpfAmount === null;
          setForm(toFormState(expense));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, expenseId]);

  useEffect(() => {
    if (!irpfAutoManaged.current) return;
    const rate = Number(form.irpfRate);
    const base = Number(form.amount);
    if (!form.irpfRate.trim() || Number.isNaN(rate) || Number.isNaN(base)) return;
    const computed = ((base * rate) / 100).toFixed(2);
    setForm((f) => (f.irpfAmount === computed ? f : { ...f, irpfAmount: computed }));
  }, [form.amount, form.irpfRate]);
```

- [ ] **Step 4: Backfill retention fields from OCR in `handleAttachFile`**

Replace lines 127-137:

```tsx
      const stored = await attachExpenseFile(source, date, note);

      setForm((f) => ({
        ...f,
        receiptFilePath: stored,
        date: f.date || extracted?.date || f.date,
        amount: f.amount || (extracted?.amount != null ? String(extracted.amount) : f.amount),
        ivaAmount:
          f.ivaAmount || (extracted?.ivaAmount != null ? String(extracted.ivaAmount) : f.ivaAmount),
        description: f.description || extracted?.vendorGuess || f.description,
      }));
```

with:

```tsx
      const stored = await attachExpenseFile(source, date, note);

      // An OCR-extracted retention amount is authoritative (it's read off the vendor's own
      // printed figure), so stop the rate×amount auto-compute effect from overwriting it later.
      if (extracted?.irpfAmount != null && !form.irpfAmount) {
        irpfAutoManaged.current = false;
      }

      setForm((f) => ({
        ...f,
        receiptFilePath: stored,
        date: f.date || extracted?.date || f.date,
        amount: f.amount || (extracted?.amount != null ? String(extracted.amount) : f.amount),
        ivaAmount:
          f.ivaAmount || (extracted?.ivaAmount != null ? String(extracted.ivaAmount) : f.ivaAmount),
        irpfRate:
          f.irpfRate || (extracted?.irpfRate != null ? String(extracted.irpfRate) : f.irpfRate),
        irpfAmount:
          f.irpfAmount ||
          (extracted?.irpfAmount != null ? String(extracted.irpfAmount) : f.irpfAmount),
        description: f.description || extracted?.vendorGuess || f.description,
      }));
```

- [ ] **Step 5: Include the fields in the save payload**

Replace lines 176-185:

```tsx
    const payload: NewExpense = {
      date: form.date,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      amount: Number(form.amount),
      ivaAmount: form.ivaAmount.trim() ? Number(form.ivaAmount) : null,
      deductiblePct: form.deductiblePct.trim() ? Number(form.deductiblePct) : 100,
      receiptFilePath: form.receiptFilePath,
      paymentProofFilePath: form.paymentProofFilePath,
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
      irpfAmount: form.irpfAmount.trim() ? Number(form.irpfAmount) : null,
      receiptFilePath: form.receiptFilePath,
      paymentProofFilePath: form.paymentProofFilePath,
    };
```

- [ ] **Step 6: Add the two form rows**

Replace lines 278-289 (the `deductiblePct` `FormRow`, keeping it as-is but adding two new rows right after it):

```tsx
        <FormRow label={t("expenses.fields.deductiblePct")}>
          <TextInput
            type="number"
            step="1"
            min="0"
            max="100"
            mono
            value={form.deductiblePct}
            onChange={(e) => set("deductiblePct", e.target.value)}
          />
        </FormRow>
```

with:

```tsx
        <FormRow label={t("expenses.fields.deductiblePct")}>
          <TextInput
            type="number"
            step="1"
            min="0"
            max="100"
            mono
            value={form.deductiblePct}
            onChange={(e) => set("deductiblePct", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.irpfRate")}>
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.irpfRate}
            onChange={(e) => set("irpfRate", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("expenses.fields.irpfAmount")}>
          <TextInput
            type="number"
            step="0.01"
            mono
            value={form.irpfAmount}
            onChange={(e) => {
              irpfAutoManaged.current = e.target.value === "";
              set("irpfAmount", e.target.value);
            }}
          />
        </FormRow>
```

- [ ] **Step 7: Typecheck**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Run: `bun run tauri dev`

In the app: open Gastos → New expense. Enter an amount (e.g. 100) and an IRPF rate (e.g. 7) — confirm the amount field auto-fills to `7.00`. Type directly into the amount field — confirm it now holds your typed value and no longer gets overwritten when you tweak the rate. Save, then reopen the expense in edit mode — confirm both fields reloaded correctly and the amount field does NOT get silently recomputed on load.

- [ ] **Step 9: Commit**

```bash
git add src/screens/GastoForm.tsx
git commit -m "feat: add IRPF retention fields to the expense form"
```

---

### Task 6: `GastoDetalle.tsx` — read-only retention row

**Files:**
- Modify: `src/screens/GastoDetalle.tsx`

**Interfaces:**
- Consumes: `ExpenseRecord.irpfRate`/`irpfAmount` (Task 3).

- [ ] **Step 1: Add the retention `InfoRow`**

Replace lines 119-123:

```tsx
        <InfoRow
          label={t("expenses.fields.deductiblePct")}
          value={`${expense.deductiblePct}% (${formatEUR(deductibleIva)})`}
          mono
        />
```

with:

```tsx
        <InfoRow
          label={t("expenses.fields.deductiblePct")}
          value={`${expense.deductiblePct}% (${formatEUR(deductibleIva)})`}
          mono
        />
        {expense.irpfAmount !== null && (
          <InfoRow
            label={t("expenses.fields.irpfRate")}
            value={`${expense.irpfRate ?? 0}% (${formatEUR(expense.irpfAmount)})`}
            mono
          />
        )}
```

- [ ] **Step 2: Typecheck**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `bun run tauri dev`

Open the expense saved in Task 5 — confirm the new "% Retención IRPF" row shows `7% (€7.00)`. Open an older expense with no retention set — confirm the row is absent entirely (not shown as `0%`).

- [ ] **Step 4: Commit**

```bash
git add src/screens/GastoDetalle.tsx
git commit -m "feat: show IRPF retention in expense detail view"
```

---

### Task 7: `ResumenTrimestral.tsx` — KPI tile + CSV export

**Files:**
- Modify: `src/screens/ResumenTrimestral.tsx`

**Interfaces:**
- Consumes: `ExpenseRecord.irpfRate`/`irpfAmount` (Task 3).

- [ ] **Step 1: Add the `% IRPF`/`IRPF` CSV columns for the Gastos section**

Replace lines 60-73:

```tsx
  lines.push(csvRow(["Gastos"]));
  lines.push(csvRow(["Fecha", "Categoría", "Descripción", "Importe", "IVA", "% deducible"]));
  for (const e of expenses) {
    lines.push(
      csvRow([
        formatDate(e.date),
        e.category ?? "",
        e.description ?? "",
        e.amount,
        e.ivaAmount ?? 0,
        e.deductiblePct,
      ]),
    );
  }
```

with:

```tsx
  lines.push(csvRow(["Gastos"]));
  lines.push(
    csvRow(["Fecha", "Categoría", "Descripción", "Importe", "IVA", "% deducible", "% IRPF", "IRPF"]),
  );
  for (const e of expenses) {
    lines.push(
      csvRow([
        formatDate(e.date),
        e.category ?? "",
        e.description ?? "",
        e.amount,
        e.ivaAmount ?? 0,
        e.deductiblePct,
        e.irpfRate ?? 0,
        e.irpfAmount ?? 0,
      ]),
    );
  }
```

- [ ] **Step 2: Compute the expense-side retention credit total**

Replace lines 121-124:

```tsx
  const expensesIva = expenses.reduce(
    (s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100),
    0,
  );
```

with:

```tsx
  const expensesIva = expenses.reduce(
    (s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100),
    0,
  );
  const expensesIrpfWithheld = expenses.reduce((s, e) => s + (e.irpfAmount ?? 0), 0);
```

- [ ] **Step 3: Relabel the existing tile and add the new one**

Replace line 211:

```tsx
        <KpiTile label="IRPF retenido" value={formatEUR(irpfWithheld)} icon={Percent} />
```

with:

```tsx
        <KpiTile
          label="IRPF retenido (facturas)"
          value={formatEUR(irpfWithheld)}
          icon={Percent}
        />
        <KpiTile
          label="IRPF retenido (gastos)"
          value={formatEUR(expensesIrpfWithheld)}
          icon={Percent}
        />
```

- [ ] **Step 4: Typecheck**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `bun run tauri dev`

Open Resumen trimestral for the quarter containing the expense from Task 5 — confirm a new "IRPF retenido (gastos)" tile shows €7.00, and the existing tile is now labeled "IRPF retenido (facturas)". Export the CSV and confirm the Gastos section has `% IRPF`/`IRPF` columns with the right values.

- [ ] **Step 6: Commit**

```bash
git add src/screens/ResumenTrimestral.tsx
git commit -m "feat: surface expense-side IRPF retention in the quarterly summary"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite and typecheck**

Run: `bun run test && bun run build`
Expected: PASS.

- [ ] **Step 2: Run the full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS (39+ existing tests plus the 3 new ones from Task 2).

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: PASS, no new warnings.

- [ ] **Step 4: Final end-to-end walkthrough**

Run: `bun run tauri dev`

Create one new expense with category "Otros", amount 200, IRPF rate 15 (auto-computes to 30.00), attach a PDF receipt whose text contains a line like `Retencion IRPF (7%): -7,00` (a plain-text PDF is enough — doesn't need to be a real scanned receipt) and confirm OCR does NOT overwrite your already-typed 15%/30.00 values (only backfills empty fields, per existing convention). Then create a second, empty expense and attach the same PDF — confirm this time the rate and amount both autofill from the receipt text. Check both expenses appear correctly in Gastos list, detail view, and the quarterly summary tile/CSV.

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), OCR extraction (Task 2), db layer (Task 3), i18n (Task 4), form UI + auto-compute + OCR wiring (Task 5), detail view (Task 6), quarterly summary KPI + CSV (Task 7) — every section of the design spec has a task. No dedicated new test *file* was added for the frontend (per the spec's "Testing" section, this rides existing coverage) — Task 5/6/7 close the gap with mandatory manual verification steps instead, per this repo's CLAUDE.md UI-verification requirement.
- **Type consistency:** `irpfRate`/`irpfAmount` (TS, camelCase) ↔ `irpf_rate`/`irpf_amount` (SQL/Rust, snake_case) used consistently across every task; `ReceiptFields.irpfRate`/`irpfAmount` (Task 3) match what `GastoForm.tsx`'s `handleAttachFile` (Task 5) reads.
- **No placeholders:** every step has literal code, not a description of code.
