# Autónomo Manager — Product Requirements Document

## 1. Overview

A desktop application (Tauri + React + TypeScript) to manage the administrative
process of working as an *autónomo* in Spain: invoicing, client management,
contract storage, and deductible expense tracking. Built local-first, with
automatic backup to a user-owned cloud location (S3/Drive folder). Tax
declaration autofill (Modelo 130/303, Verifactu/SII) is explicitly deferred to
v2 but the data model is designed so v1 doesn't need to be reworked to support it.

## 2. Goals

- Generate legally valid, sequential, gap-free invoices per client series
  (e.g. `IMO-001`, `IMO-002`).
- Support clients with different VAT treatments (standard, reverse charge EU,
  export outside EU, other exemptions), each with a legally correct note,
  snapshotted per invoice, in the client's invoice language.
- Support rectification invoices (*facturas rectificativas*) that reference
  and correct a prior invoice without ever mutating it.
- Manage clients, contracts (file storage), and deductible expenses.
- Multi-language invoice output (starting with ES/EN, extensible to CA).
- Local SQLite storage with automatic backup to a user-configured cloud folder.

## 3. Non-goals (v1)

- Verifactu / SII real-time reporting (planned v2).
- Automatic tax filing / AEAT integration (planned v2).
- Multi-user / multi-device real-time sync (single-user, local-first).

## 4. Tech Stack

- **Tauri 2.x** (Rust backend)
- **React + TypeScript** (frontend)
- **SQLite** via `tauri-plugin-sql` or `sqlx`
- **PDF generation**: Rust-native (`printpdf` or `genpdf`), one template per language
- **i18n**: `react-i18next` for UI; separate note/template tables for invoice content
- **Backup**: scheduled/on-close export of DB + PDFs to a user-chosen local folder
  that syncs to their own Drive/S3

## 5. Data Model (v1)

```sql
clients (
  id, name, nif_cif, address, email, phone, notes,
  invoice_prefix TEXT UNIQUE,        -- 3-letter, e.g. 'IMO'
  next_invoice_number INTEGER DEFAULT 1,
  next_rectification_number INTEGER DEFAULT 1,
  vat_treatment TEXT,                -- 'standard' | 'reverse_charge_eu' |
                                      -- 'export_outside_eu' | 'exempt_other'
  invoice_language TEXT              -- 'es' | 'en' | 'ca' (default, overridable per invoice)
)

vat_note_templates (
  id, treatment_code, language, note_text
)

invoices (
  id, client_id, series_prefix, invoice_number,   -- e.g. 'IMO', 1 -> 'IMO-001'
  issue_date, due_date, status,                   -- status: draft | issued | paid
  vat_treatment, vat_note_text, language,          -- snapshotted at issue time
  client_name_snapshot, client_address_snapshot, client_nif_snapshot,
  subtotal, iva_rate, iva_amount, irpf_rate, irpf_amount, total,
  pdf_path,
  is_rectification BOOLEAN DEFAULT FALSE,
  rectifies_invoice_id INTEGER REFERENCES invoices(id),
  rectification_reason TEXT,          -- free text or coded reason
  rectification_type TEXT             -- 'full' | 'partial'
)

invoice_lines (
  id, invoice_id, description, quantity, unit_price, total
)

contracts (
  id, client_id, title, file_path, start_date, end_date, status, notes
)

expenses (
  id, date, category, description, amount, iva_amount,
  deductible_pct, receipt_file_path
)
```

### Key rules baked into v1

- Invoice numbers are assigned **atomically at issue time**, inside a DB
  transaction, by reading and incrementing `next_invoice_number` (or
  `next_rectification_number` for rectificativas). Never editable after.
- Once `status = issued`, an invoice is **immutable**. Corrections always
  create a new rectification invoice referencing the original via
  `rectifies_invoice_id`.
- Rectification invoices use their own counter per client (e.g.
  `IMO-R001`) and always carry a reason and type (full cancellation vs.
  partial correction).
- VAT treatment is **all-or-nothing per invoice** (no mixed-rate line items).
  `vat_note_text` is resolved from `vat_note_templates` at issue time and
  snapshotted onto the invoice — never a live join.
- Client fields used on an invoice (name, address, NIF) are snapshotted at
  issue time so edits to the client later don't alter historical invoices.

## 6. Milestones

Each milestone below is written as a standalone prompt to hand to Claude Code
with `/plan`, one at a time, in order. Do not start milestone *N+1* until
*N* is merged and working.

---

### Milestone 0 — Project Scaffolding

```
/plan Set up a new Tauri 2.x + React + TypeScript project called
"autonomo-manager". Configure tauri-plugin-sql with SQLite. Set up
react-i18next with es/en locale namespaces. Set up a clean folder structure
separating: src/features (clients, invoices, contracts, expenses),
src/db (schema/migrations/queries), src-tauri (Rust commands). Add ESLint,
Prettier, and a basic CI-friendly test setup (Vitest). No business logic yet
— just a working scaffold with a placeholder home screen and a working SQLite
connection verified by a trivial migration + query round trip.
```

### Milestone 1 — Database Schema & Migrations

```
/plan Implement the SQLite schema for autonomo-manager based on the PRD's
data model section: clients, vat_note_templates, invoices, invoice_lines,
contracts, expenses. Use migrations (not a single init script) so the schema
can evolve. Include the UNIQUE constraint on clients.invoice_prefix, foreign
keys with appropriate ON DELETE behavior, and seed vat_note_templates with
the standard reverse_charge_eu and export_outside_eu notes in es and en.
Write basic Rust-side data access functions (or TS query helpers, whichever
fits the plugin) for CRUD on clients, and unit tests confirming the prefix
uniqueness constraint and default counters work.
```

### Milestone 2 — Client Management Module

```
/plan Build the client management feature for autonomo-manager: list view,
create/edit form, and delete (soft or hard, your call — flag it) for clients.
Fields: name, nif_cif (with basic Spanish NIF/CIF format validation),
address, email, phone, notes, invoice_prefix (3 uppercase letters, validated
unique against the DB before save), vat_treatment (select: standard /
reverse_charge_eu / export_outside_eu / exempt_other), invoice_language
(select: es / en / ca). Show clear validation errors. Use react-i18next for
all UI strings.
```

### Milestone 3 — Invoice Core: Line Items, Calculation, Numbering

```
/plan Build the invoice creation flow for autonomo-manager. A draft invoice
picks a client, has line items (description, quantity, unit price, computed
total), and computes subtotal, IVA (21/10/4% or 0 depending on the client's
vat_treatment, enforced all-or-nothing), IRPF withholding (15% standard,
7% reduced — make this a selectable rate, not hardcoded), and total.
Implement the atomic numbering transaction: on "Issue" (not on save-as-draft),
assign series_prefix + invoice_number by incrementing
clients.next_invoice_number inside a DB transaction, and lock the invoice
(status = issued, no further edits to line items or amounts). Resolve and
snapshot vat_note_text from vat_note_templates using the client's
vat_treatment + invoice_language (or an override language chosen per
invoice). Snapshot client_name/address/nif onto the invoice at issue time.
Write tests specifically for: numbering never collides under rapid
sequential issuance, and an issued invoice cannot be mutated.
```

### Milestone 4 — Invoice PDF Generation

```
/plan Implement PDF generation for issued invoices in autonomo-manager using
a Rust-native PDF library. Create at least two templates (es, en) that
render: your business details (configurable in app settings), the client
snapshot, invoice number/series, issue/due dates, line items table, subtotal,
IVA/IRPF breakdown, total, and the vat_note_text if present. Store the
generated PDF path on the invoice record and add a "download/open PDF"
action in the UI. Make the business's own details (name, NIF, address, bank
details/IBAN) configurable once in an app settings screen and reused across
all invoices.
```

### Milestone 5 — Rectification Invoices

```
/plan Implement facturas rectificativas for autonomo-manager. From an issued
invoice, add a "Create rectification" action that opens a new invoice
pre-linked via rectifies_invoice_id, with rectification_type (full
cancellation vs. partial correction) and a required rectification_reason.
Full cancellation auto-populates negative/mirrored line items to zero out
the original; partial correction starts blank for the corrected line items
only. Rectifications get their own numbering series per client
(clients.next_rectification_number, e.g. IMO-R001), assigned atomically the
same way as regular invoices, and are immutable once issued. Update the PDF
template to clearly label a rectification invoice and reference the
original invoice number and reason. Update the invoice list view to show
the rectification relationship (link to original / list of rectifications
against an invoice).
```

### Milestone 6 — Contracts Module

```
/plan Build the contracts feature for autonomo-manager: attach one or more
files per client (store files in the app's data directory, keep file_path +
metadata in the contracts table), with title, start_date, end_date, status
(active/expired/terminated), and notes. List/filter contracts by client and
status. Support opening the stored file with the OS default application via
a Tauri command.
```

### Milestone 7 — Expenses / Deductible Receipts

```
/plan Build the expenses feature for autonomo-manager: list/create/edit
expenses with date, category (freeform or a small predefined list —
suministros, material, software, etc.), description, amount, iva_amount,
deductible_pct, and an attached receipt file (image or PDF). Add a summary
view showing total expenses and total deductible IVA for a selected date
range (month/quarter/year), since this will feed manual quarterly tax
filing for now.
```

### Milestone 8 — Backup & Export

```
/plan Implement backup for autonomo-manager: a settings screen where the
user points to a local folder (which they sync to Drive/S3 themselves via
OS-level tools). On app close (and optionally on a schedule), copy the
SQLite DB file and the invoices/contracts/receipts file directories into
timestamped backup folders there, pruning backups older than a configurable
number of days. Add a manual "Backup now" button and a "Restore from
backup" flow that lets the user pick a backup folder and restores it
(with a confirmation step since this overwrites current data).
```

### Milestone 9 — Quarterly Summary View (manual filing helper)

```
/plan Build a read-only quarterly summary dashboard for autonomo-manager
that aggregates, for a selected quarter: total invoiced (base + IVA +
IRPF withheld) broken down by IVA rate, total deductible expenses + IVA,
and a simple net IRPF-relevant income figure. This is purely informational
to help manually fill Modelo 130/303 — no AEAT integration. Include an
export-to-CSV action for the underlying invoice and expense rows in the
period.
```

---

## 7. v2 (future, not scoped in detail here)

- Verifactu / SII: hash-chained invoice records, QR code on PDFs, real-time
  submission to AEAT.
- Autofill Modelo 130 (IRPF) and Modelo 303 (IVA) declarations.
- Possibly: recurring/templated invoices, client portal, payment reminders.
