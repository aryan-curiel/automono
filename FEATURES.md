# Feature Roadmap

Research pass over four areas: Verifactu compliance, analytics, contract/receipt
autofill, and backup structure — plus other gaps found while auditing what's
already built. Ordered by what's worth doing first, not by category.

**What already exists** (so nothing below duplicates it): invoice series with
IVA/IRPF, rectifying invoices, PDF generation (`pdf.rs`), receipt/contract file
attachments (copy-into-app-data, no OCR), a full DB+files backup/restore system
with retention and auto-backup-on-close, quarterly VAT/IRPF summary with CSV
export, and a business profile with bank details. See `PRODUCT.md`/`DESIGN.md`
for the product framing.

---

## 1. Verifactu compliance

Spain's new anti-fraud invoicing standard. Not a new tax — a technical/security
standard invoicing software must meet, enforced by AEAT (the tax agency).

**Deadlines** (confirmed pushed back from the original 2026 dates):
- Corporate-tax companies: mandatory from **Jan 1, 2027**.
- Everyone else, including autónomos: mandatory from **July 1, 2027**.

**What compliant software must do:**
- Generate an immutable "invoicing record" for every invoice — corrections/
  cancellations create a *new* record, never edit or delete the old one.
- Chain each record to the previous one via hash, forming a tamper-evident
  sequential log (this is exactly the append-only shape AutoMono's issued-invoice
  lock triggers already assume — Verifactu just adds the hash chain and AEAT
  submission on top).
- Print `VERIFACTU` and a verification QR code on the invoice.
- Transmit each record to AEAT in real time (or queue and flush — the two
  legal modes are "Verifactu" and "no-Verifactu", the former requiring
  immediate submission).
- Keep a separate event log (system starts/stops, exports, etc.).

**Implementation path — don't build the AEAT connection yourself.** Several
providers (Verifacti, B2Brouter, Kreyo, efsta) sell certified Verifactu-as-a-
service: you POST structured invoice data (series, number, dates, type
F1/F3/R1-R5, line items, recipient NIF), they handle the hash chain, QR, XML,
and AEAT transmission, and return status. This is a thin Rust HTTP client
(new `verifactu.rs` module) plus a "Verifactu" toggle + provider API key field
in Ajustes → Datos, not a new subsystem. Given the deadline is 11 months out,
this doesn't need to be built now, but the invoice model should stay
append-only-friendly (it already is) so bolting this on later is a small diff.

- [ ] Pick a Verifactu API provider, add a Rust client + submit-on-issue hook
- [ ] Store `verifactu_status` / `verifactu_qr_url` per invoice
- [ ] Render QR + "VERIFACTU" marker on the generated PDF (`pdf.rs`)
- [ ] Settings toggle + API credentials in Ajustes

## 2. Analytics

Dashboard today has revenue trend, pending/overdue, client count, and expenses.
Genuinely useful additions, roughly in order of value for a solo freelancer:

- **Revenue by client** — bar/list of top clients by billed amount this
  year/quarter, so you know who actually pays the bills.
- **Aging report** — unpaid invoices grouped by how overdue (0-30/30-60/60+),
  instead of a single "overdue" count.
- **Expense breakdown by category** — pie/bar over the free-text `category`
  field that already exists on expenses; near-zero backend work, just a
  `GROUP BY category` query.
- **Tax calendar / upcoming obligations** — Modelo 130 (quarterly IRPF), 303
  (quarterly IVA), 390/190 (annual summaries) with the standard Spanish filing
  deadlines (1-20 of the month after each quarter, Jan 1-30 for annuals).
  `ResumenTrimestral.tsx` already computes the numbers; this just surfaces the
  *dates* — a dashboard card, no new financial logic.
- **YoY / quarter-over-quarter comparison** — same revenue/expense charts, one
  prior-period line overlaid.
- **Simple margin/profit view** — revenue minus expenses minus IRPF withheld,
  per quarter. All inputs already exist in `invoices` and `expenses`.

Skip cash-flow forecasting and multi-scenario projections — that's a
different product (real accounting software), not what a solo autónomo opens
the app to see.

## 3. Autofill from documents

This is the one area with zero existing groundwork (attachments exist, parsing
doesn't). Two distinct flows, same underlying pattern (extract text → structured
fields → prefill a form the user still reviews before saving):

**Receipt → expense form.** On `attachExpenseFile()`, before saving, run OCR/
extraction over the attached image or PDF and prefill `date`, `amount`,
`ivaAmount`, and guess `category` from the vendor name. For image receipts,
this needs real OCR (Tesseract via a Rust crate, or a cloud vision API since
this is a desktop Tauri app, not a phone camera — the accuracy bar for scanned
photos is meaningfully higher than for text PDFs). For emailed PDF receipts,
much simpler: extract embedded text directly (`pdf-extract` crate) and regex
for amount/date/IVA before ever touching image OCR — this covers the common
case (email PDF invoices from suppliers) with far less engineering than OCR.

**Contract → invoice/client prefill.** When a contract PDF is attached, extract
rate, currency, payment terms, and billing frequency (monthly/one-off) to
prefill `ContratoForm`, and — the actually valuable part — use those terms to
auto-generate the next invoice's line items when the user hits "new invoice"
for that client, instead of typing them from scratch every month. This is a
bigger lift than receipt OCR since contract terms are free-form English/Spanish
prose, not fielded data — realistically this wants an LLM call (extract JSON
from contract text) rather than regex, given contract wording isn't standardized
like a receipt total line.

Build receipt-PDF-text-extraction first (cheapest, highest hit rate), OCR
second, contract-LLM-extraction third — each is a separable, shippable slice.

- [ ] `pdf-extract`-based text scrape + regex for PDF receipts → prefill GastoForm
- [ ] OCR fallback for image receipts (jpg/png already accepted by the file picker)
- [ ] LLM-based field extraction for contract terms → prefill ContratoForm
- [ ] "Generate invoice from contract" using extracted line items/rate

## 4. Backup folder structure

The backup system already does the hard part correctly: full DB snapshot +
the `contracts/expenses/invoices` app-data subtrees, into timestamped
`backup-<ts>/` folders, with retention pruning and restore. What's missing is
*browsability* — right now the files inside are named by internal copy
timestamps, not by what they are, so opening the folder in Finder doesn't tell
you which receipt belongs to which expense.

- **Human-readable filenames on attach**, not just on backup: rename copied
  files to something like `2026-08-02_client-acme_receipt.pdf` /
  `2026-Q3_INV-2026-014_acme-corp.pdf` at `copy_into()` time (`contracts.rs`),
  so the *live* app-data folder is already organized, and the backup — being a
  straight copy of it — inherits that structure for free.
  - **ponytail: this requires the exact naming rule agreed with you first** —
    "client + type + date" above is a guess; nail down the real convention
    before touching `copy_into`, since it's shared by contracts and expenses
    and a rename scheme is a one-way door once files exist on people's disks.
- **A per-year/per-client folder layout** instead of flat `expenses/receipts/`
  — e.g. `invoices/2026/acme-corp/`, `expenses/2026/receipts/`. Same
  `copy_into` call, different `dest_dir` argument, no new subsystem.
  Also lets an accountant/gestor just be handed a year folder at tax time.
- **"Open backup folder" button** in Ajustes next to the existing backup
  controls — one Tauri `opener` call, already used elsewhere in the codebase.
- **Bundle-for-accountant export** — a "Export year for gestor" button that
  zips that year's invoice PDFs + expense receipts + the CSV summary
  (`export.rs` already writes CSV) into one folder/zip. This is the feature
  that actually delivers on "find documents easily" for the person who most
  needs to: whoever does your taxes.

## 5. Other high-value gaps

Found while auditing, not directly asked for, but the kind of thing a
freelancer invoicing tool is missing without:

- **Recurring invoice generation** — for clients on a monthly retainer,
  auto-create (or one-click-create) next month's invoice from the last one's
  line items instead of duplicating manually every time. `duplicateInvoice`
  already exists as of tonight's session — this is scheduling that, not new
  duplication logic.
- **Payment reminders** — a native notification or dashboard nudge when an
  issued invoice crosses its due date. The `dueDate` field already exists;
  this is a scheduled check, no new data.
- **Late-payment interest calculator** — Spain's Ley 3/2004 sets a statutory
  late-payment interest rate for B2B invoices; a small calculator/note on
  overdue invoices (interest owed if you chased it) is a nice, cheap touch.
- **Invoice branding** — logo upload + rendering it on the generated PDF.
  Currently text-only per `pdf.rs`; this is one image field + one draw call.
- **Global search (Cmd+K)** — jump to any client/invoice/contract by name or
  number. With four list screens and no cross-entity search, this is the
  first thing that'll feel missing once the client list gets past ~20 rows.
- **Client running balance** — total invoiced vs. total paid per client, shown
  on `ClienteDetalle`. Same data as the aging report, sliced differently.

---

## Suggested order

1. Analytics additions (aging report, expense-by-category, tax calendar) —
   cheapest, reuses existing data, no new Tauri commands.
2. Backup folder browsability (naming + per-year layout + open-folder button)
   — small diff, high payoff for "can I find my documents."
3. Receipt PDF-text-extraction autofill — the highest-value autofill slice
   for the lowest engineering cost.
4. Recurring invoices + payment reminders — closes the loop on the invoice
   lifecycle work already done this session.
5. Verifactu — no rush (deadline is July 2027), but keep the invoice model
   append-only as it already is, so this stays a bolt-on later.
6. Contract-LLM-extraction and OCR — highest effort, do last, and only once
   the cheaper autofill slice above proves the pattern is worth it.

---

## Sources (Verifactu)

- [Verifactu para autónomos: guía para adaptarte en 2026](https://docuten.com/es/blog/verifactu-para-autonomos-que-saber/)
- [Nuevos plazos para Verifactu en 2027](https://www.autonomosyemprendedor.es/articulo/autonomos/nuevos-plazos-verifactu-2027-que-autonomos-van-tener-que-cambiar-programas-facturacion/20251230143941047321.html)
- [¿Es VeriFactu obligatorio para autónomos? Plazos y Guía 2026](https://www.b2brouter.net/es/verifactu-obligatorio-autonomos/)
- [VeriFactu Regulation in Spain: What Businesses Need to Know for 2026](https://meridianglobalservices.com/verifactu-regulation-in-spain-what-businesses-need-to-know-for-2026/)
- [VeriFactu in Spain: Technical requirements and operational readiness](https://www.avalara.com/blog/en/europe/2026/05/verifactu-technical-requirements.html)
- [Verifactu API Documentation (Verifacti)](https://www.verifacti.com/en/docs)
