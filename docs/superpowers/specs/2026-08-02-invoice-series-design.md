# Invoice series as a separate entity

## Problem

Invoice numbering (prefix + counters) currently lives directly on the `clients`
table, 1:1 with a client. That forces a dedicated series per client even for a
client invoiced once. There's no way to have a shared series (e.g. `ACP-###`)
that many occasional, one-off clients draw from.

## Goal

Decouple invoice series from clients: a series is its own entity with a
prefix and its own counters. A client points at a series (`series_id`).
Multiple clients can point at the same series. When creating or editing a
client, the user picks an existing series or creates a new one inline.

Out of scope (YAGNI for now): a standalone series management screen (list,
rename, delete, usage view). Series are created inline from the client form
and never deleted — they're meant to accumulate and be reused (that's the
whole point of a shared "occasional clients" series). No separate display
name for a series either — the prefix (e.g. `ACP`) is the only identifier.

## Data model

New table:

```sql
CREATE TABLE invoice_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prefix TEXT NOT NULL UNIQUE,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  next_rectification_number INTEGER NOT NULL DEFAULT 1
);
```

`clients` loses `invoice_prefix`, `next_invoice_number`,
`next_rectification_number`; gains `series_id INTEGER NOT NULL REFERENCES
invoice_series(id)`.

The `invoices` table is unaffected — `series_prefix`/`invoice_number` are
already plain snapshot columns on each invoice row (`UNIQUE (series_prefix,
invoice_number, is_rectification)`), not FKs to `clients`. That decoupling
already exists at the invoice level; this change only affects how a client's
*next* prefix/number gets looked up and incremented at issue time.

## Migration

SQLite can't add a `NOT NULL REFERENCES` column or drop columns from
`clients` in place cleanly alongside the data backfill, so this migration
rebuilds `clients`, following the same pattern `0013_rectification_numbering.sql`
used to rebuild `invoices`:

1. `INSERT INTO invoice_series (prefix, next_invoice_number,
   next_rectification_number) SELECT invoice_prefix, next_invoice_number,
   next_rectification_number FROM clients` — one series per existing client,
   counters carried over exactly. Zero behavior change for current data.
2. Rebuild `clients` with `series_id` populated via `(SELECT id FROM
   invoice_series WHERE prefix = clients.invoice_prefix)`, dropping the three
   old columns.
3. Any triggers/indexes referencing dropped columns are recreated as needed
   (none currently reference these three columns directly, per a check of
   the existing trigger definitions in `0008_invoice_lock.sql` and
   `0013_rectification_numbering.sql`).

## Backend (Rust) — `src-tauri/src/invoicing.rs`

`issue_invoice` and `create_rectification` currently read
`invoice_prefix`/counter straight off `clients` keyed by `client_id`, then
increment the counter on `clients`. Both change to join through to the
client's series and increment on `invoice_series`:

```rust
let client = sqlx::query(
    "SELECT s.id AS series_id, s.prefix, s.next_invoice_number,
            c.name, c.address, c.nif_cif, c.vat_number, c.vat_treatment, c.invoice_language
     FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
)
...
sqlx::query("UPDATE invoice_series SET next_invoice_number = next_invoice_number + 1 WHERE id = ?")
    .bind(series_id)
```

Same swap in `create_rectification` for `next_rectification_number`.
Everything downstream (the `IssuedInvoice` struct, the writes to `invoices`)
is unchanged. Transaction/locking semantics (single tx, SQLite file-level
serialization) stay identical, just against a different table.

The existing test that inserts a client with `invoice_prefix = 'ACM'`
directly (around `invoicing.rs:452`) needs an `invoice_series` row inserted
first, with the client referencing its id.

## Frontend

**`src/db/series.ts` (new):**

```ts
export interface SeriesRecord { id: number; prefix: string; }
export async function listSeries(): Promise<SeriesRecord[]>
```

Reuses `isValidInvoicePrefix` from `src/features/clients/validators.ts` — no
new validator.

**`src/db/clients.ts`:**

- `ClientRecord` drops `invoicePrefix`/`nextInvoiceNumber`/
  `nextRectificationNumber`; gains `seriesId: number`, `seriesPrefix:
  string`, `nextInvoiceNumber`, `nextRectificationNumber` — the latter three
  populated via `JOIN invoice_series ON invoice_series.id = clients.series_id`,
  so every existing read site still gets the same shape it has today, just
  sourced from the join instead of the client row directly.
- `NewClient` replaces `invoicePrefix: string` with `series: { id: number } |
  { newPrefix: string }`.
- `createClient`/`updateClient` resolve that union before writing: `newPrefix`
  → `INSERT INTO invoice_series (prefix) VALUES (?)`, use the new id;
  `id` → used as-is. Then write `series_id` on the client row.
- The duplicate-prefix catch in `ClienteForm.tsx` (currently matching
  `UNIQUE` + `invoice_prefix`) becomes `UNIQUE` + `invoice_series.prefix`,
  reachable only via the "new series" path.

**`src/screens/ClienteForm.tsx`:**

- The single `invoicePrefix` `TextInput` becomes a `Select` listing existing
  series prefixes plus a sentinel `+ Nueva serie` option. The row label stays
  `clients.fields.invoicePrefix` (already reads "Invoice series" in en /
  equivalent in es — no copy change needed for the label).
- Picking a real series sets `seriesId` directly. Picking the sentinel
  reveals a `TextInput` below for a new prefix, reusing
  `isValidInvoicePrefix` and the existing "prefix taken" error message.
- **Create mode** defaults to the sentinel with an empty prefix input —
  matches today's blank-input default behavior exactly.
- **Edit mode** defaults to the client's current series pre-selected;
  changing it to a different existing series or to "new" is allowed. This is
  how a client moves onto (or off of) a shared series like `ACP`.

**Read-only display sites** (`Clientes.tsx`, `ClienteDetalle.tsx`,
`FacturaNueva.tsx`, `FacturaRectificar.tsx`): swap `client.invoicePrefix` →
`client.seriesPrefix`. `nextInvoiceNumber`/`nextRectificationNumber` reads are
unchanged in shape. No behavior change on these screens.

## Testing

- `src/db/clients.test.ts`, `src/db/migrations.test.ts`, and the Rust test
  near `invoicing.rs:452` each construct a client via a direct
  `invoice_prefix` insert — each needs a one-line `invoice_series` insert
  added first, then reference its id as `series_id`.
- New test: two clients sharing one series each get sequential invoice
  numbers off that series' single counter (the core behavior this change
  enables).
- New test: creating a client with a brand-new prefix creates exactly one
  `invoice_series` row; creating a second client and picking that same
  existing series creates zero new rows and both clients share the counter.
