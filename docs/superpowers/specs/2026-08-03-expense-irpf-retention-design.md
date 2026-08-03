# Expense IRPF Retention Tracking

## Problem

When a vendor issuing a professional-services invoice to the user (e.g. their
Gestor) applies IRPF retention (commonly 7% or 15% in Spain), the vendor
withholds that amount and it becomes a prepayment credit against the user's
own IRPF liability — Hacienda already has it, via the vendor's declaration.
Today the `expenses` table has no way to record this: only `amount` (deductible
base), `iva_amount`, and `deductible_pct` exist. The quarterly summary
(`ResumenTrimestral`) therefore understates the user's IRPF credits, since it
only counts IRPF withheld by the user's own clients on invoices issued
(`irpf_amount` on `invoices`), not IRPF withheld by the user's own vendors on
expenses received.

This is the direct inverse of the existing invoice-side IRPF concept, and
should mirror its schema/formula/UI conventions wherever they apply.

## Scope

Any expense can optionally carry an IRPF retention — not restricted to a
vendor category. Rate is user-entered (no hardcoded default, since real rates
vary: 7% reduced first-year, 15% standard, 1%/2% for specific activities).
Amount auto-computes from rate × base amount but stays a manually-overridable
field, since a vendor's invoice may round differently or compute from a
slightly different base.

## Schema

New migration `0022_expense_irpf_retention.sql`:

```sql
ALTER TABLE expenses ADD COLUMN irpf_rate REAL;
ALTER TABLE expenses ADD COLUMN irpf_amount REAL;
```

Both nullable; null on both means "no retention applies," matching how
`invoices.irpf_rate`/`irpf_amount` already behave. No backfill required —
existing rows simply have no retention. Must be registered in
`all_migrations()` in `src-tauri/src/lib.rs` per the project's two-place
migration rule, and will automatically be picked up by
`src/db/migrations.test.ts`'s directory rescan.

## Backend

### `src/db/expenses.ts`

Add `irpfRate: number | null` and `irpfAmount: number | null` to
`ExpenseRecord`/`ExpenseRow`/`NewExpense`. Touch the same four spots the prior
`paymentProofFilePath` addition touched: `mapRow`, the `createExpense` INSERT,
and the `COLUMN_BY_KEY` map used by `updateExpense`'s dynamic `SET`.

### `src-tauri/src/receipt_extract.rs`

Add `irpf_rate: Option<f64>` and `irpf_amount: Option<f64>` to `ReceiptFields`.

- Amount: reuse the existing `last_number_on_line_containing(&text, keyword)`
  helper, trying `"retenc"` then falling back to `"irpf"` — identical pattern
  to today's `iva_amount` scan (`last_number_on_line_containing(&text,
  "iva")`).
- Rate: new small helper that scans the same matched line for a `NN` or
  `NN,N` token immediately followed by `%`. Local to this file, no new crate.
- Add `"retenc"` / `"irpf"` to `NON_VENDOR_KEYWORDS` so a retention line is
  never mistaken for the vendor-name guess line.
- Extend the existing `#[cfg(test)] mod tests` block with a case covering a
  synthetic receipt body containing a retention line.

## Frontend

### `src/screens/GastoForm.tsx`

Two new number inputs, placed next to the existing IVA/deductible fields:
`irpfRate` (%) and `irpfAmount` (€).

- Auto-compute: whenever `irpfRate` changes (or the base `amount` changes
  while a rate is set), recompute `irpfAmount = amount * rate / 100` — but
  only when the current `irpfAmount` is empty or still equal to the last
  auto-computed value, so a manual edit to `irpfAmount` is never clobbered.
  This is the same non-destructive-autofill spirit already used for OCR
  backfill in this file, applied to a live computed field instead of a
  one-shot extraction.
- OCR autofill: `handleAttachFile`'s existing "only fill empty fields" backfill
  gains `irpfRate`/`irpfAmount` alongside `date`/`amount`/`ivaAmount`/
  `description`.

### `src/screens/GastoDetalle.tsx`

New `InfoRow` "IRPF retenido" (label from i18n) showing `{rate}% (€{amount})`,
rendered only when `irpfAmount` is non-null — placed next to the existing
deductible-IVA info row.

### `src/screens/ResumenTrimestral.tsx`

- New computed value: `expensesIrpfWithheld = expenses.reduce((s, e) => s +
  (e.irpfAmount ?? 0), 0)`.
- Existing "IRPF retenido" KPI tile relabeled "IRPF retenido (facturas)" for
  clarity; new sibling tile "IRPF retenido (gastos)" showing
  `expensesIrpfWithheld`.
- CSV export (`buildExportCsv`): add `% IRPF` / `IRPF` columns to the Gastos
  section header and rows, mirroring the columns the Facturas section already
  has for invoice-side IRPF.

Note: `ResumenTrimestral.tsx` is not currently i18n'd (hardcoded Spanish
strings throughout, unlike the rest of the app) — the new tile label follows
that file's existing convention rather than introducing i18n only here.

### i18n (`src/locales/{es,en}/common.json`)

New keys under `expenses.fields`: `irpfRate`, `irpfAmount` — following this
file's existing fully-i18n'd, camelCase-matches-TS-field-name convention
(distinct from `ResumenTrimestral`'s hardcoded-string convention above).

## Testing

- Extend `src/lib/analytics.test.ts`'s expense fixture with `irpfRate: null,
  irpfAmount: null` (same fix required last time a field was added, for
  `paymentProofFilePath`).
- Extend `receipt_extract.rs`'s existing inline test module with a
  retention-line parsing case.
- `cargo test` (`all_sql_files_are_registered_as_migrations` guards the new
  migration is wired into `all_migrations()`), `bun run test`, `bun run
  build` (tsc) as the standard verification pass — no new test files needed,
  this rides existing coverage per the ladder (no new test scaffolding for a
  straightforward field addition following an established pattern).

## Out of scope

- No hardcoded default IRPF rate for expenses (unlike invoices'
  `IRPF_DEFAULT_RATE = 7`), since expense retention rates vary too much by
  vendor/activity to guess usefully.
- No new attachment/file type for a "Gestor invoice" — the existing
  `receiptFilePath`/`paymentProofFilePath` pair already covers document
  storage; retention is just two more numeric fields on the same record.
