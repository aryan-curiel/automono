# Tax rules: how AutoMono computes each figure

> **Not tax advice.** This document describes what AutoMono's code does today, with file
> references, so that contributors and accountants can check it and fix it. It is not a
> statement of Spanish tax law. Every figure the app produces (the casilla pre-fill, the Modelo
> 347/349 summaries, the Renta estimate, the late-interest letters) is a working aid that a
> gestor or asesor should review before anything is filed. Where the code looks like it differs
> from the law, the item is listed under [Known gaps / to verify](#known-gaps--to-verify)
> instead of being presented as fact.

Line numbers were accurate when this was written. If they have drifted, search for the symbol
name.

## Contents

1. [Invoice amounts and rounding](#1-invoice-amounts-and-rounding)
2. [Numbering, series, rectifying invoices, immutability](#2-numbering-series-rectifying-invoices-immutability)
3. [VAT treatments and the legal notes printed](#3-vat-treatments-and-the-legal-notes-printed)
4. [IRPF retention on issued invoices](#4-irpf-retention-on-issued-invoices)
5. [Identifier validation (NIF/CIF/NIE, VAT number, IBAN, series prefix)](#5-identifier-validation)
6. [Expenses: deductible %, deductible IVA %, IRPF withheld](#6-expenses)
7. [Period attribution: accrual vs criterio de caja](#7-period-attribution-accrual-vs-criterio-de-caja)
8. [Quarterly snapshot (shared by 303/130/111)](#8-quarterly-snapshot)
9. [Modelo 303](#9-modelo-303)
10. [Modelo 130](#10-modelo-130)
11. [Modelo 111](#11-modelo-111)
12. [Modelo 347](#12-modelo-347)
13. [Modelo 349](#13-modelo-349)
14. [Annual summary and the Renta (IRPF) estimate](#14-annual-summary-and-the-renta-irpf-estimate)
15. [Deadline calendar and filing reminders](#15-deadline-calendar-and-filing-reminders)
16. [Late-payment interest (Ley 3/2004)](#16-late-payment-interest-ley-32004)
17. [Not implemented](#17-not-implemented)
18. [Known gaps / to verify](#known-gaps--to-verify)

---

## 1. Invoice amounts and rounding

Each invoice has **one** IVA rate and **one** IRPF rate. Rates are not stored per line.

| Step                      | Formula                             | Source                         |
| ------------------------- | ----------------------------------- | ------------------------------ |
| Line total                | `round2(quantity × unitPrice)`      | `src/lib/invoice.ts:15`        |
| Subtotal (base imponible) | `round2(Σ lineTotal)`               | `src/lib/invoice.ts:55`, `:39` |
| IVA (cuota)               | `round2(subtotal × ivaRate / 100)`  | `src/lib/invoice.ts:40`        |
| IRPF retention            | `round2(subtotal × irpfRate / 100)` | `src/lib/invoice.ts:41`        |
| Total                     | `round2(subtotal + IVA − IRPF)`     | `src/lib/invoice.ts:46`        |

`round2(x) = Math.round(x × 100) / 100` (`src/lib/invoice.ts:21`). This rounds half away from
zero for positive values and half toward +∞ for negative ones (JS `Math.round`). Floating point
noise can still nudge a value that should be exactly `.xx5`.

The Rust side recomputes the same amounts, in the same order, when an invoice is issued and
stores them. Those stored values are what the PDF, the declarations and the exports use:
`src-tauri/src/invoicing.rs:143-156` (`issue_invoice`) and `:335-339` (`create_rectification`).
`round_cents` in Rust (`invoicing.rs:12`) uses `f64::round` (half away from zero, including
for negatives).

Worked examples (`src/lib/invoice.test.ts`):

| Lines         | IVA  | IRPF | Subtotal | IVA amt | IRPF amt | Total   |
| ------------- | ---- | ---- | -------- | ------- | -------- | ------- |
| 10.10 + 20.20 | 21 % | 0 %  | 30.30    | 6.36    | 0        | 36.66   |
| 1 × 1000      | 21 % | 15 % | 1000.00  | 210.00  | 150.00   | 1060.00 |

Live previews on screen (`FacturaNueva.tsx:136-138`, `FacturaRectificar.tsx:86-92`) compute
the same figures **without** rounding. They are display only. The stored figures come from Rust.

**IVA rates offered** (`src/screens/FacturaNueva.tsx:293-295`): 21 (general), 10 (reducido),
4 (superreducido). The default comes from `preferences.defaultIvaRate`. When the client's VAT
treatment is not `standard`, the selector is replaced by a read-only "special treatment" field
and the effective rate is 0 (`FacturaNueva.tsx:110-111`). Rust enforces this again on issue
(`invoicing.rs:107-109`).

**Due date**: if the invoice has no due date when it is issued, Rust sets it to issue date + 30
days (`invoicing.rs:166`).

## 2. Numbering, series, rectifying invoices, immutability

### Series

- A series is a row in `invoice_series` with fields `prefix` (unique), `next_invoice_number`
  and `next_rectification_number` (`src-tauri/migrations/0016_invoice_series.sql`). Every client
  points to exactly one series. Several clients can share one series.
- The prefix must be exactly 3 letters A–Z (`src/features/clients/validators.ts:8`).
- Counters **never reset** by year. No year component exists in the number.

### Number label

`invoiceNumberLabel` (`src/lib/invoice.ts:9-13`) produces:

| Case                                  | Label      |
| ------------------------------------- | ---------- |
| Draft (no number)                     | `Borrador` |
| Regular invoice #7 in series `AAA`    | `AAA-007`  |
| Rectifying invoice #7 in series `AAA` | `AAA-R007` |

Numbers are zero-padded to 3 digits. Beyond 999 they simply grow longer. The PDF uses the
equivalent `format_number_label` in `src-tauri/src/pdf.rs:71`.

### Issuing (draft → issued)

`issue_invoice` (`src-tauri/src/invoicing.rs:59-216`) does all of the following in one SQLite
transaction:

1. Rejects the request unless the invoice is `draft`.
2. Reads the client's series and takes `next_invoice_number`, then increments it (`:158`).
3. Forces IVA to 0 for non-`standard` treatments and IRPF to 0 for foreign clients (see §3, §4).
4. Resolves the VAT note text (see §3).
5. Snapshots client name, address, NIF, VAT number and country onto the invoice row.
6. Recomputes and stores the amounts.
7. Sets the status with `WHERE status = 'draft'`. If the row count is not 1, it aborts. This
   guards against two concurrent issues of the same invoice.

The uniqueness constraint is `UNIQUE (series_prefix, invoice_number, is_rectification)`
(`0013_rectification_numbering.sql`). Regular invoice #1 and rectifying invoice #1 in the same
series can therefore coexist.

### Rectifying invoices (facturas rectificativas)

`create_rectification` (`invoicing.rs:275-424`):

- Only an `issued` or `paid` regular invoice can be rectified. A rectifying invoice cannot itself
  be rectified, and an invoice can be rectified **at most once** (`:296-310`).
- It uses the separate `next_rectification_number` counter of the same series, which gives the
  `R` series.
- It inherits the original's VAT treatment, VAT note, language, client snapshots, IVA rate and
  IRPF rate (`:312-322`). It does not re-read the client.
- A reason is required (`FacturaRectificar.tsx:96-99`).
- Type is `full` or `partial` (`0004_invoices.sql` CHECK):
  - `full`: the editor pre-fills the original's lines with `unitPrice` negated, so the totals
    cancel exactly (`FacturaRectificar.tsx:65-77`).
  - `partial`: starts blank. The user enters the difference lines, which are normally negative.
- It is created as a draft row, the lines are inserted, then it is flipped to `issued` in the same
  transaction (`:348-407`). There is no separate draft phase for rectifying invoices.
- The PDF prints "Factura rectificativa" and "Rectifica a la factura <n>. Motivo: <reason>"
  (`pdf.rs:186-187`, `:612-624`).

Rectifying invoices are ordinary invoice rows with (usually) negative amounts. They therefore
reduce the totals in every period they fall in, by their own issue date.

### Immutability

These triggers are defined in `0008_invoice_lock.sql`, re-created in `0013` and redefined in
`0019_invoice_client_country_snapshot.sql`.

| Rule                                                                                                                                                                                            | Enforced by                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Once `issued`/`paid`, these columns cannot change: status back to draft, series/number, client, issue date, VAT treatment/note, language, all client snapshots, subtotal, rates, amounts, total | `trg_invoices_lock_after_issue`                                                                                                            |
| Lines of an issued/paid invoice cannot be inserted, updated or deleted                                                                                                                          | `trg_invoice_lines_lock_after_issue_{ins,upd,del}`                                                                                         |
| Still mutable after issue                                                                                                                                                                       | `status` (`issued` → `paid`, and back), `due_date`, `pdf_path`, `amount_paid`, `paid_date`                                                 |
| Only drafts can be deleted                                                                                                                                                                      | Application only: `deleteInvoice` uses `WHERE status = 'draft'` (`src/db/invoices.ts:341-344`). No DB trigger blocks deleting issued rows. |

## 3. VAT treatments and the legal notes printed

Each client has `vat_treatment` ∈ {`standard`, `reverse_charge_eu`, `export_outside_eu`,
`exempt_other`} (`0016_invoice_series.sql`). The issued invoice snapshots it.

**Suggested treatment from the client's country** (`src/features/clients/taxDefaults.ts:49-53`):

| Client country                                                     | Suggested treatment |
| ------------------------------------------------------------------ | ------------------- |
| empty or `ES`                                                      | `standard`          |
| one of the 27 EU members in `EU_COUNTRIES` (`taxDefaults.ts:4-32`) | `reverse_charge_eu` |
| anything else                                                      | `export_outside_eu` |

This is only a suggestion. The user can override it. Nothing checks whether the client is a
business or a consumer.

**Effect on the invoice:**

| Treatment           | IVA rate used           | Note printed (from `vat_note_templates`)                                                                                                                                                                                                                  |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `standard`          | user's choice (21/10/4) | none                                                                                                                                                                                                                                                      |
| `reverse_charge_eu` | forced 0                | ES: "Operación no sujeta al IVA español conforme al artículo 69.Uno.1º de la Ley 37/1992. IVA repercutido en destino conforme al artículo 196 de la Directiva 2006/112/CE del Consejo — a autoliquidar por el destinatario." (`0011_vat_note_art196.sql`) |
| `export_outside_eu` | forced 0                | ES: "Operación exenta de IVA por exportación de servicios fuera de la Unión Europea (art. 21 Ley 37/1992)." (`0003_vat_note_templates.sql`)                                                                                                               |
| `exempt_other`      | forced 0                | **no template exists**, so nothing is printed                                                                                                                                                                                                             |

English versions exist for both notes. Lookup happens at issue time
(`invoicing.rs:120-134`). The code tries the invoice language first and falls back to `es`. No
Catalan (`ca`) template exists, so Catalan invoices fall back to the Spanish note. The note text
is copied onto the invoice (`vat_note_text`) and is immutable afterwards. Editing a template only
affects invoices issued after the edit.

The original 0003 note for `reverse_charge_eu` cited "art. 25 Ley 37/1992 (entrega
intracomunitaria)". 0011 replaced it. Invoices issued before 0011 ran keep the old text.

## 4. IRPF retention on issued invoices

| Rule                                                                                                                                              | Source                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| IRPF is applicable only when the client's country is empty or `ES`                                                                                | `irpfApplicable`, `taxDefaults.ts:55-57`           |
| Foreign client: IRPF rate forced to 0. The line is still shown, with a "foreign client" suffix                                                    | `invoicing.rs:114-116`, `FacturaNueva.tsx:112-122` |
| Rates offered: 15 (general), 7 (reducido), 0                                                                                                      | `FacturaNueva.tsx:308-310`                         |
| Default rate: 7 % in the calendar year of RETA alta and the 2 following calendar years, 15 % afterwards. A missing or invalid alta date gives 7 % | `defaultIrpfRate`, `taxDefaults.ts:37-47`          |

Examples from the tests (`taxDefaults.test.ts`), with alta 2024-06-01:

| Date       | Default rate |
| ---------- | ------------ |
| 2024-03-01 | 7            |
| 2026-12-31 | 7            |
| 2027-01-01 | 15           |

The client being a business or professional (retention required) or a private individual (no
retention) is **not** modelled. The user has to pick 0 % manually for a private individual.

## 5. Identifier validation

All validators are in `src/features/clients/validators.ts` and `src/features/settings/validators.ts`.
They uppercase and trim the input first.

| Field                                 | Rule                                                                                                                                                                               | Checksum?                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| NIF/CIF/NIE (client and own business) | Valid when **either** the Spanish pattern `^(\d{8}[A-Z]\|[XYZ]\d{7}[A-Z]\|[A-HJNP-SUVW]\d{7}[0-9A-J])$` matches **or** a generic `^[A-Z0-9]{5,20}$` matches (`validators.ts:3-13`) | No. No DNI/NIE mod-23 letter and no CIF control digit |
| EU VAT number (NIF-IVA)               | Optional (empty allowed). Otherwise `^[A-Z]{2}[A-Z0-9]{2,12}$` (`validators.ts:7`, `:15-18`)                                                                                       | No. No per-country format and no VIES lookup          |
| IBAN (own business)                   | `^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$` plus ISO 7064 mod-97 = 1 (`settings/validators.ts`)                                                                                                | Yes                                                   |
| Series prefix                         | `^[A-Z]{3}$`                                                                                                                                                                       | n/a                                                   |

Because of the generic fallback, **any 5–20 character alphanumeric string passes as a NIF**. The
test suite asserts this deliberately (`"123456789"` is accepted as a foreign tax number). In
practice, Spanish identifiers are not validated beyond length and characters.

## 6. Expenses

Columns: `src/db/expenses.ts:6-34`, plus migrations 0021, 0022, 0028, 0031 and 0036.

| Field                    | Meaning in the calculations                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amount`                 | Base imponible, IVA excluded                                                                                                                                                                                     |
| `ivaAmount`              | Input IVA (cuota soportada) as recorded, nullable                                                                                                                                                                |
| `deductiblePct`          | % of `amount` that is deductible for IRPF (Modelo 130)                                                                                                                                                           |
| `ivaDeductiblePct`       | % of `ivaAmount` that is deductible on Modelo 303. `NULL` means the same as `deductiblePct` (`ivaDeductiblePctOf`, `expenses.ts:40-45`)                                                                          |
| `irpfRate`, `irpfAmount` | IRPF that **you** withheld when paying this supplier (professional invoices, rent). Feeds Modelo 111. The form auto-computes `irpfAmount = rate × amount` unless the user overrides it (`GastoForm.tsx:115-118`) |
| `provider`               | Free-text supplier name. Feeds Modelo 347                                                                                                                                                                        |
| `declaredPeriod`         | `"YYYY-QN"` override that moves the expense into another quarter                                                                                                                                                 |
| `paidDate`               | Used only under criterio de caja                                                                                                                                                                                 |
| `declared`               | Informational flag, set when the quarter's declaration is completed                                                                                                                                              |

The separate IVA percentage exists because IVA and IRPF deductibility can differ. Migration 0031
gives the examples of a vehicle (50 % IVA / 0 % IRPF) and home-office supplies.

Worked example (`quarterlyDeclaration.test.ts`, "uses a separate ivaDeductiblePct"): an expense
with `deductiblePct = 0`, `ivaDeductiblePct = 50` and `ivaAmount = 21` adds 10.50 to deductible
IVA and 0 to the IRPF-deductible base.

## 7. Period attribution: accrual vs criterio de caja

The preference `criterio_caja` is off by default (`0035_preferences_criterio_caja.sql`).
`basis = criterioCaja ? "cash" : "accrual"` (`src/db/declarations.ts:119`, `:148`;
`ResumenTrimestral.tsx:283`).

| Data     | Accrual (`devengo`, default)                                                                                                                       | Cash (`criterio de caja`)                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Invoices | status ≠ draft and `issueDate` in the period (`invoicesInPeriod`, `quarterlyDeclaration.ts:9-17`)                                                  | status = `paid` and **`issueDate`** in the period (`cashInvoicesInPeriod`, `:39-50`)                                            |
| Expenses | `declaredPeriod` set: included if it is one of the period's quarters. Otherwise included if `date` is in the period (`expensesInPeriod`, `:68-75`) | `declaredPeriod` set: same as accrual. Otherwise included if `paidDate ?? date` is in the period (`expensesForBasis`, `:83-95`) |

Notes on the cash basis as implemented:

- An invoice issued in Q1 and paid in Q3 is counted in **Q1**, once it is marked paid. It is
  **not** moved to the quarter of collection. The code says this is temporary (comment at
  `:37-38`). `invoices.paid_date` exists (0039) but these filters do not use it.
- A partly paid invoice stays `issued` until `amount_paid ≥ total − 0.005`
  (`src/db/invoices.ts:335`). Until then, the cash basis ignores it completely.
- An expense is only re-bucketed by `paidDate` if it is already in the list the screen loaded.
  That list is loaded by `date`/`declaredPeriod`, so an expense dated in another quarter but paid
  in this one is missed (comment at `:80-82`).
- `buildModelo349` and `cumulativeModelo130` always use accrual, whatever the preference (see
  §10 and §13).

Each frozen declaration snapshot records the `basis` it was built with.

## 8. Quarterly snapshot

`buildDeclarationSnapshot(invoices, expenses, basis)` (`src/lib/quarterlyDeclaration.ts:155-224`)
is the single function behind the live quarter view (`ResumenTrimestral`), the frozen
declaration (`DeclarationWizard` → `createDeclaration`), the annual summary and the YTD Modelo 130. Its inputs are already filtered by period and basis (§7).

| Total                    | Formula                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoicedBase`           | `round2(Σ inv.subtotal)`                                                                                                                                 |
| `ivaByRate[r]`           | per distinct `inv.ivaRate`: `{ base: round2(Σ subtotal), iva: round2(Σ ivaAmount) }`. Rate-0 invoices (reverse charge, export, exempt) form a `0` bucket |
| `irpfWithheld`           | `round2(Σ inv.irpfAmount)`. Retentions **clients** withheld from you                                                                                     |
| `expensesDeductibleBase` | `round2(Σ e.amount × e.deductiblePct/100)`                                                                                                               |
| `expensesIvaDeductible`  | `round2(Σ (e.ivaAmount ?? 0) × ivaDeductiblePctOf(e)/100)`                                                                                               |
| `expensesIrpfWithheld`   | `round2(Σ (e.irpfAmount ?? 0))`. Retentions **you** withheld from suppliers                                                                              |
| `netIrpfIncome`          | `round2(invoicedBase − expensesDeductibleBase)`                                                                                                          |
| `margin`                 | `round2(netIrpfIncome − irpfWithheld)` (informational KPI only)                                                                                          |

Sums are accumulated unrounded and rounded once at the end. Per-invoice amounts are already
rounded (§1).

In the declaration wizard (`src/components/DeclarationWizard.tsx`), the user can untick
individual expenses (step 2) and pick a GDJ rate of 0, 2, 5 or 7 % (step 3, default 5). The
snapshot is then frozen as JSON in `quarterly_declarations.snapshot_json`, and `gdj_rate` is
stored alongside it (migrations 0025 and 0032). Each (year, quarter) can have at most one
declaration.

The CSV export (`buildDeclarationCsv`, `:228-284`) lists invoices and expenses with their
rates and amounts.

## 9. Modelo 303

`expectedCasillas("303", snapshot)` (`src/lib/modeloReport.ts:115-130`) is used by both the
read-only pre-fill card (`src/components/CasillaPrefill.tsx`) and the review that compares the
app's figures against an uploaded modelo PDF.

| App field                         | Form box it is compared with       | Formula                 | Compared?                                     |
| --------------------------------- | ---------------------------------- | ----------------------- | --------------------------------------------- |
| IVA devengado                     | casilla 27 (total cuota devengada) | `Σ ivaByRate[r].iva`    | yes, tolerance ±0.02 € (`modeloReport.ts:38`) |
| IVA deducible                     | casilla 45 (total a deducir)       | `expensesIvaDeductible` | yes, ±0.02 €                                  |
| Resultado (antes de compensación) | casilla 71 / 69                    | `devengado − deducible` | **no**, marked informational                  |

Casilla numbers come from the PDF extraction prompt in `src-tauri/src/modelo_review.rs:133-147`.

Worked example (`modeloReport.test.ts`): one invoice with base 1000 and IVA 210, and one expense
with base 100, IVA 21 and 100 % deductible. The result is devengado 210, deducible 21,
resultado 189.

Not computed:

- The per-rate base/cuota boxes. `ivaByRate` holds the data, but no casilla is emitted for it.
- Casilla 59 (EU services) and casilla 60 (exports).
- Self-assessed reverse-charge IVA on purchases.
- Cuotas a compensar from earlier periods.
- Prorrata.
- The annual Modelo 390.

## 10. Modelo 130

### Cumulative (used whenever a declaration exists for the quarter)

`cumulativeModelo130(invoices, expenses, year, quarter, gdjRatePct)`
(`src/lib/modeloReport.ts:66-101`). For each `q` from 1 up to the target quarter:

```
period   = 1 Jan .. last day of q          (always accrual: invoicesInPeriod / expensesInPeriod)
net      = netIrpfIncome(period)           = YTD invoiced base − YTD deductible expense base
ret      = irpfWithheld(period)            = YTD retentions on your invoices
gdj      = min(2000, round2(gdjRatePct/100 × max(0, net)))
pago_q   = max(0, round2(0.20 × (net − gdj) − ret − priorPagos))
priorPagos += pago_q                       (only after quarters before the target)
```

Constants: `DEFAULT_GDJ_RATE = 5` and `GDJ_ANNUAL_CAP = 2000` (`modeloReport.ts:42-44`). The GDJ
rate is the one stored on the focused declaration. It is applied to every quarter of the year,
not only the current one.

The output, which the pre-fill card shows and which is compared against the PDF:

| App field                    | Meaning                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| Rendimiento neto (acumulado) | `net` for the target quarter (**before** the GDJ deduction) |
| Pago fraccionado             | `pago` for the target quarter                               |

`priorPagos` comes from the app's own recomputation of earlier quarters. Amounts actually filed
are not used (comment at `:62-64`).

Worked examples (`modeloReport.test.ts`, GDJ 5 %):

| Case                                          | YTD net | GDJ                        | 20 % × (net − GDJ) | YTD ret | Prior pagos         | Pago      |
| --------------------------------------------- | ------- | -------------------------- | ------------------ | ------- | ------------------- | --------- |
| Q1: invoice 10 000 (ret 1 500), expense 2 000 | 8 000   | 400                        | 1 520              | 1 500   | 0                   | **20**    |
| Q2: same again in Q2                          | 16 000  | 800                        | 3 040              | 3 000   | 20                  | **20**    |
| Q1 1 000 (ret 250), Q2 20 000 (ret 0), at Q2  | 21 000  | 1 050                      | 3 990              | 250     | 0 (Q1 floored at 0) | **3 740** |
| Q1 invoice 200 000                            | 200 000 | 2 000 (capped from 10 000) |                    |         |                     |           |

### Isolated-quarter fallback

When there is no YTD context (`modeloReport.ts:148-162`):
`pago = max(0, 0.20 × netIrpfIncome − irpfWithheld)` for that quarter alone, with no GDJ. It is
labelled "estimación aislada".

### RETA cuota

The RETA monthly fee reduces rendimiento neto the same way as any other cost: record it as a
monthly expense. Migration 0026 added `preferences.reta_monthly_cuota` (default 80 €/month), but no
code reads it, so changing it has no effect. `reta_start_date` (0027) is used for the default IRPF
rate (§4) and to find the alta quarter in `ResumenTrimestral` (`:277`).

## 11. Modelo 111

Modelo 111 appears in the per-quarter checklist only if `preferences.presents_modelo_111` is on
(default off, `0033_preferences_modelo_111.sql`). The calculation is in
`modeloReport.ts:164-176`:

| App field              | Formula                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Base de retenciones    | `Σ e.amount` over the snapshot's expenses with `irpfAmount > 0` |
| Retenciones ingresadas | `expensesIrpfWithheld` = `Σ e.irpfAmount`                       |

Example (`modeloReport.test.ts`): expenses of 300 (IRPF 21) and 100 (IRPF 0) give a base of 300
and retenciones of 21.

The app has no payroll and no split by perceptor type (employees vs professionals vs other). It
does not count perceptores.

## 12. Modelo 347

`buildModelo347(invoices, expenses, year)` (`src/lib/modelo347.ts:89-133`), shown on
`ResumenAnual`.

- Threshold: a counterparty is listed when its annual total, IVA included, is **strictly greater
  than** 3 005,06 € (`MODELO_347_THRESHOLD`, `:12`, `:71`). Sales and purchases are tested
  separately.
- **Sales (clave B)**: invoices from `invoicesInPeriod(year)` (accrual, non-draft, by issue
  date), grouped by `clientId`. Amount = `round2(subtotal + ivaAmount)`. Excluded:
  `reverse_charge_eu`, `export_outside_eu`, any invoice with `irpfAmount > 0`, and zero amounts.
- **Purchases (clave A)**: expenses whose `date` is in the year, grouped case-insensitively by the
  trimmed `provider`. Amount = `round2(amount + ivaAmount)`. Excluded: no provider, expenses with
  `irpfAmount > 0`, and zero amounts. `declaredPeriod` and `paidDate` are ignored here.
- Each row carries a breakdown by calendar quarter of the operation date (`quarterIndex`, `:50`).
- Provider NIF is always `null`, because suppliers have no NIF field.

Rectifying invoices count with their own sign in their own quarter.

## 13. Modelo 349

`buildModelo349(invoices, period)` (`src/lib/modelo349.ts:42-65`) runs for the focused quarter on
`ResumenTrimestral` (`:422`). The result is appended to the quarter CSV when it has rows.

- Always accrual: non-draft invoices with `issueDate` in the period, whatever the criterio de caja
  setting.
- Includes only invoices with `vatTreatment = "reverse_charge_eu"`.
- One row per client: snapshotted NIF-IVA, snapshotted country, clave **`S`** (always) and
  `base = round2(Σ subtotal)`.
- Rectifying invoices are netted into the same row.

The goods/services split (clave E) is not modelled. Rectifications of earlier periods are not
reported separately. The monthly vs quarterly periodicity test is not implemented.

## 14. Annual summary and the Renta (IRPF) estimate

`annualTotals` and `annualPnl` (`src/lib/annualSummary.ts`) call `buildDeclarationSnapshot` over
1 Jan–31 Dec, always on the accrual basis. The figures are revenue = `invoicedBase`, expenses =
`expensesDeductibleBase` and net = `netIrpfIncome`. Revenue is also broken down by client, and
expenses by category. No GDJ and no RETA are included.

`estimateAnnualIrpf(net)` (`src/lib/irpfEstimate.ts:78-89`), called with `pnl.net` on
`ResumenAnual.tsx:66`, works like this:

```
taxableBase = round2(max(0, net − 5550))           // DEFAULT_PERSONAL_ALLOWANCE
tax         = Σ over brackets of (portion of taxableBase in bracket × rate)
effective   = tax / taxableBase × 100
```

Combined state + default autonómica scale (`IRPF_BRACKETS`, `:22-29`):

| From    | To      | Rate |
| ------- | ------- | ---- |
| 0       | 12 450  | 19 % |
| 12 450  | 20 200  | 24 % |
| 20 200  | 35 200  | 30 % |
| 35 200  | 60 000  | 37 % |
| 60 000  | 300 000 | 45 % |
| 300 000 | —       | 47 % |

Example (`irpfEstimate.test.ts`): net 30 000 gives a base of 24 450. Tax = 12 450×19 % + 7 750×24 %

- 4 250×30 % = 5 500,50 €. The marginal rate is 30 % and the effective rate about 22.5 %.

The estimate does **not** subtract the Modelo 130 pagos or the retentions already suffered, so
it is a gross cuota, not the amount owed or refunded on the return. There is also no regional
scale, no reductions, no family minimums beyond the flat 5 550 and no savings base.

## 15. Deadline calendar and filing reminders

`nextTaxDeadlines(today, count)` (`src/lib/taxCalendar.ts:77-90`) produces:

| Item                      | Due date                | Source                        |
| ------------------------- | ----------------------- | ----------------------------- |
| Modelo 130/303 Q1, Q2, Q3 | 20 Apr, 20 Jul, 20 Oct  | `quarterlyDeadline`, `:29-39` |
| Modelo 130/303 Q4         | 30 Jan of the next year | same                          |
| Modelo 190/390 (annual)   | 30 Jan of the next year | `annualDeadline`, `:52-58`    |

- A deadline on a Saturday or Sunday rolls to Monday (`rollOffWeekend`, `:19-25`). National and
  regional holidays are **not** considered.
- The Q4 and annual entries share a due date, so they are merged into one row (`mergeSameDay`).
- Not in the calendar: Modelo 111 (it shares the quarterly dates but is not labelled), 349, 347
  (February), 180 and Renta.

Example (`taxCalendar.test.ts`): 30 Jan 2027 is a Saturday, so the merged Q4 + annual row is due
2027-02-01. 20 Apr 2025 is a Sunday, so Q1 is due 2025-04-21.

**Reminders** (`src/lib/filingReminders.ts`):

- When the app starts, it looks at the next 6 deadlines.
- It sends one OS notification per deadline once 7, 3 and 1 days remain (`REMINDER_THRESHOLDS`).
- It does nothing for a deadline whose quarter (`deadlineQuarterKey`) already has a `completed`
  declaration.
- Notifications already sent are de-duplicated in `localStorage`.
- The app cannot notify while it is closed.

## 16. Late-payment interest (Ley 3/2004)

```
daysOverdue    = max(0, daysBetween(dueDate, today))           src/lib/lateInterest.ts:4-6
lateInterest   = principal × annualRatePct/100 × days/365       src/lib/lateInterest.ts:15-18
```

The interest is simple, on a fixed 365-day year, and not rounded inside the function.

- The rate is entered by the user. Both screens default it to **8 %**
  (`DEFAULT_LATE_INTEREST_RATE_PCT`, `FacturaDetalle.tsx:22`, `Cobros.tsx:22`). The letter text
  describes the statutory rate as "ECB reference + 8 points, published in the BOE every half-year"
  and asks the reader to verify it. The rate is not fetched or stored.
- The principal differs between screens:
  - `FacturaDetalle` uses the invoice `total` (`:142`).
  - The claim letter in `Cobros` uses the `outstanding` amount (`collections.ts:95`).
- The claim letter (`lateInterestLetter`, `collections.ts:91-151`) also mentions the fixed 40 €
  recovery compensation. That amount is **not** added to the total claimed.

Examples (`lateInterest.test.ts`): 1 000 € at 8 % for 365 days gives 80 €. Due 2026-07-20 and
checked on 2026-08-03 gives 14 days overdue.

## 17. Not implemented

- **Verifactu / SII / TicketBAI**: not implemented. No hash chain, no QR code, no submission to
  AEAT. The plan is in `docs/FUTURE_FEATURES.md` and listed as v2 in `docs/PRD.md`. The app
  generates PDF invoices locally only.
- Filing or submitting any modelo. AutoMono only pre-fills reference values and compares them
  against PDFs the user has already filed.
- Modelo 390, 190, 180 and 100 (Renta) computations. 190/390 appear only as calendar entries.
- Recargo de equivalencia, prorrata, régimen simplificado (módulos), REBU and other special
  regimes.
- Per-line IVA rates. Mixed-rate invoices are not possible.

---

## Known gaps / to verify

These items are where the code may differ from Spanish rules or from AEAT's form definitions.
None of them has been confirmed as a bug. An asesor should check each one.

1. **Modelo 130, casilla 03 vs GDJ.** On the form, gastos de difícil justificación are
   included in casilla 02 (gastos), so casilla 03 already has GDJ subtracted. The app's
   "Rendimiento neto (acumulado)" is the value **before** GDJ. It is compared against casilla 03,
   so it may be flagged as a mismatch against a correctly filed form.
2. **Modelo 130, missing reductions.** The art. 110.3.c RIRPF deduction (casilla 13, for low
   prior-year rendimientos) and the housing-loan deduction (casilla 16) are not applied. The
   exemption from filing 130 when more than 70 % of income was subject to retention is not
   detected either.
3. **Cumulative 130 ignores choices made in the wizard.** It is always accrual, even when
   criterio de caja is on. It uses every YTD expense, so expenses unticked in the wizard still
   count. It also recomputes prior pagos instead of using the amounts actually filed.
4. **The criterio de caja implementation is partial.**
   - Invoices are attributed by issue date, not by collection date.
   - Partial collections are ignored.
   - There is no 31 December (year + 1) cut-off for unpaid invoices.
   - Invoices issued under RECC do not carry the required "Régimen especial del criterio de caja"
     mention.
   - RECC is an IVA regime, while IRPF cash criterion (art. 7.2 RIRPF) is a separate option. The
     app applies one switch to both.
5. **Note for `export_outside_eu`.** It cites art. 21 LIVA (exempt exports). Services to
   non-EU business clients are usually **not subject** under the location rules (art. 69/70 LIVA),
   not exempt under art. 21. The right note may depend on the service and the client type.
6. **No legal note for `exempt_other`.** Spanish invoicing rules (RD 1619/2012 art. 6.1.j)
   require an exempt invoice to cite the exemption provision, such as art. 20 LIVA. No template
   exists, so nothing is printed.
7. **Reverse charge assumed for every EU client.** The suggestion and the 349 inclusion do not
   check that the client is a business with a valid VIES-registered VAT number. B2C sales to EU
   consumers would be wrongly treated as not subject.
8. **IRPF retention for private individuals.** No client-type field exists. Retention should not
   be applied when the client is not a business or professional.
9. **NIF/CIF/NIE validation is effectively format-free** because of the generic 5–20 character
   fallback. There is no control-letter or control-digit check, and VAT numbers are not checked
   against VIES.
10. **Issue-date order inside a series is not enforced.** A later number can carry an earlier
    date than the number before it.
11. **Deleting issued invoices is blocked only in the application**, not by a DB trigger.
12. **Non-deductible input IVA.** When `ivaDeductiblePct < 100`, the non-deductible part of the
    IVA is not added to the IRPF-deductible expense base. It is commonly treated as a deductible
    cost.
13. **Modelo 303, purchases.** Intra-EU or foreign purchases subject to reverse charge are not
    self-assessed (casillas 10/11 and 36/37). Their IVA is simply not recorded.
14. **Modelo 347.** It has no provider NIFs. Intra-EU and import purchases are not excluded on the
    purchase side. RECC-specific reporting is not implemented. Grouping by provider name means
    spelling variants split a counterparty into separate rows.
15. **Modelo 349.** Rectifications of earlier periods are netted into the current period instead
    of being reported in the rectifications section. Clave E (goods) is not supported.
16. **Renta estimate.** The mínimo personal is subtracted from the base. AEAT's method instead
    computes tax on the full base and subtracts the tax on the mínimo. Example: net 30 000 gives
    5 500,50 € in the app versus about 6 111 € with the cuota-on-mínimo method. The app's figure
    is therefore likely an underestimate. The scale is also not regional, and 2026 changes are
    not tracked.
17. **Deadlines.**
    - Modelo 190 is due 31 January, not 30 January (390 is 30 January).
    - Holidays are not rolled.
    - 111, 349, 347 and Renta deadlines are missing.
    - Direct-debit (domiciliación) deadlines, which are earlier, are not shown.
18. **Late interest.**
    - The 8 % default is below the current statutory rate whenever the ECB rate is above 0.
    - The principal differs between the invoice detail screen (total) and the claim letter
      (outstanding).
    - The 40 € compensation is mentioned in the letter but not included in the claimed total.
19. **Snapshot invoice numbers.** `buildDeclarationSnapshot` (`quarterlyDeclaration.ts:184-185`)
    builds `"PREFIX-N"` without zero-padding and without the `R` marker. The CSV numbers
    therefore differ from the PDFs, and a rectifying invoice can show the same number as a
    regular one.
20. **Rounding direction.** JS `Math.round` and Rust `f64::round` differ on exact negative
    halves (JS rounds −0.5 to 0, Rust rounds it to −1). Today only Rust produces stored amounts, so
    this has no effect yet. It will matter if JS ever recomputes negative amounts (rectifying
    invoices) that are meant to match the stored ones. The previews in `FacturaNueva` and
    `FacturaRectificar` do not round at all.
