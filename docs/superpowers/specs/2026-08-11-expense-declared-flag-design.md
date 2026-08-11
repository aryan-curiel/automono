# Expense "Declared" Flag

## Problem

Nothing today marks an expense as having actually been filed with Hacienda.
`quarterly_declarations` is the only persisted declaration concept, and it
locks a whole quarter's frozen *snapshot* — but the individual `expenses` rows
that fed that snapshot carry no trace of it. There's no way to glance at an
expense (in the main Gastos list or its detail view) and tell "this was
already declared" vs. "this hasn't been filed yet," and no way to mark one by
hand for cases outside the normal quarterly flow (e.g. an expense declared
manually outside the app).

## Scope

- `declared` is a plain boolean on `expenses`. It does not restrict editing or
  deleting the expense — badge-only, no lock (unlike a completed
  declaration's snapshot).
- Two ways to become `true`:
  1. **Automatic**: completing a quarterly declaration
     (`markDeclarationCompleted`) flags every expense in that declaration's
     frozen snapshot.
  2. **Manual**: a toggle in the Gastos list and detail screens, independent
     of any declaration — can also be used to un-declare.
- No filter/toggle added to `ResumenTrimestral`/`DeclaracionDetalle`, no
  analogous flag on invoices (invoices already use computed quarter
  membership, not a stored flag, and neither was requested).

## Schema

New migration `0029_expense_declared.sql`:

```sql
ALTER TABLE expenses ADD COLUMN declared INTEGER NOT NULL DEFAULT 0;
```

Existing rows default to not-declared. Must be added to `all_migrations()` in
`src-tauri/src/lib.rs` per the project's two-place migration rule; picked up
automatically by `src/db/migrations.test.ts`'s directory rescan.

## Backend

### `src/db/expenses.ts`

- `ExpenseRecord`/`NewExpense`: add `declared: boolean`.
- `ExpenseRow`: add `declared: number` (SQLite integer), mapped in `mapRow`
  via `!!row.declared`.
- `createExpense`'s INSERT: add `declared` (as `input.declared ? 1 : 0`).
- `COLUMN_BY_KEY`: add `declared: "declared"`, so `updateExpense(id, {
  declared })` works via the existing generic patch path — no new function
  needed for the manual toggle.

### `src/db/declarations.ts`

In `markDeclarationCompleted`, after the `status = 'completed'` update
succeeds, flag every expense in that declaration's frozen snapshot:

```ts
const ids = declaration.snapshot.expenses.map((e) => e.id);
if (ids.length > 0) {
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(`UPDATE expenses SET declared = 1 WHERE id IN (${placeholders})`, ids);
}
```

Using the frozen snapshot's own expense list (rather than re-querying by
date range) means this is correct regardless of `declared_period` overrides —
it flags exactly what was actually filed.

## Frontend

### `src/screens/GastoForm.tsx`

`payload: NewExpense` gains `declared: expense?.declared ?? false` — preserves
the flag on edit, defaults to not-declared for new expenses. No form field;
this is not user-editable at creation time.

### `src/screens/Gastos.tsx`

In the list row, next to the category `Badge`, render a `success`-tone
`Badge` reading `t("expenses.declaredBadge")` when `e.declared` is true (no
badge when false). Add a `MenuItem` to the row's existing `Menu` that toggles
it: `t("expenses.actions.markDeclared")` / `t("expenses.actions.unmarkDeclared")`
depending on current state, calling `updateExpense(e.id, { declared: !e.declared })`
then triggering the existing `retry()`-style reload.

### `src/screens/GastoDetalle.tsx`

Same `success`-tone badge next to the page title/header when
`expense.declared`. Add a `MenuItem` to the existing `Menu` (alongside
`delete`) toggling `declared` via `updateExpense`, then refetching the
expense.

### i18n (`src/locales/{es,en}/common.json`)

New keys under `expenses`: `declaredBadge` ("Declarada" / "Declared"), and
under `expenses.actions`: `markDeclared` ("Marcar como declarada" / "Mark as
declared"), `unmarkDeclared` ("Marcar como no declarada" / "Mark as not
declared").

## Testing

- Extend `src/lib/analytics.test.ts`'s expense fixture with `declared: false`
  (same fix required for every prior expense field addition).
- `src-tauri`: extend/confirm `all_sql_files_are_registered_as_migrations`
  still passes (`cargo test`).
- `bun run test`, `bun run build` (tsc) as the standard verification pass — no
  new test file needed; this is a straightforward field + two UI toggles
  following an established pattern.

## Out of scope

- No locking of declared expenses against edit/delete.
- No bulk toggle in `DeclaracionDetalle`.
- No mirrored flag on invoices.
