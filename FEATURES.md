# Feature Roadmap

Research pass over three areas: analytics, contract/receipt autofill, and
backup structure — plus other gaps found while auditing what's already built.
See `FUTURE_FEATURES.md` for Verifactu compliance.

**Status: everything below is shipped**, except the two items explicitly
deferred at the user's call in "Autofill from documents" (OCR, contract-LLM
extraction) — see that section for why.

---

## 1. Analytics — done

Dashboard: revenue-by-client, aging report (0-30/30-60/60+), expense-by-
category, and a tax-calendar card (next Modelo 130/303/190/390 deadlines).
Resumen trimestral: a margin (post-IRPF) KPI tile plus YoY deltas on revenue
and margin, comparing against the same period one year back.

Skipped cash-flow forecasting and multi-scenario projections — that's a
different product (real accounting software), not what a solo autónomo opens
the app to see.

## 2. Autofill from documents

**Receipt → expense form — done.** `pdf-extract`-based text scrape + hand-
rolled parsing (date/total/IVA/vendor) over PDF receipts, prefilling
`GastoForm`'s date/amount/ivaAmount/description on attach, before the user
saves. Covers the common case (emailed PDF receipts/invoices).

**OCR for image receipts (jpg/png) and LLM-based contract-term extraction —
deferred, by explicit user decision.** Both need either a paid external
service + API key (cloud OCR/vision, an LLM API) or a heavier local
dependency (Tesseract + language data), and the PDF-text slice above already
covers the common case. Revisit if scanned-photo receipts or manual contract
re-typing turn out to actually be a recurring pain point.

## 3. Backup folder structure — done

Attach-time filenames are now `<date>_<note or original name>.<ext>` (date =
the expense's date / contract's start date, not attach time), bucketed into
per-year folders (`expenses/<year>/receipts/`, `contracts/<year>/<client_id>/`)
so backups inherit the same organization for free. Plus an "Abrir carpeta"
button in Ajustes, and an "Exportar paquete (gestor)" button on Resumen
trimestral that bundles the period's invoice PDFs + expense receipts + CSV
summary into one folder (only already-generated/attached files are included —
open an invoice at least once to generate its PDF before bundling).

## 4. Other high-value gaps — done

- **Recurring invoices** — Dashboard nudges any client invoiced last month but
  not yet this one, one click away from a duplicate draft via the existing
  `duplicateInvoice`.
- **Payment reminders** — covered by the Dashboard aging card (task 1), not a
  separate native notification — the doc allowed either.
- **Late-payment interest calculator** — a Ley 3/2004-style calculator on
  overdue invoices in `FacturaDetalle`, with an editable annual rate (the
  actual BOE-published rate isn't hardcoded, since it changes twice a year).
- **Invoice branding** — logo upload in Ajustes → Datos, rendered in the PDF
  masthead.
- **Global search (Cmd+K)** — cross-entity quick-jump across clients,
  invoices, and contracts.
- **Client running balance** — total invoiced vs. paid per client on
  `ClienteDetalle`.

## 5. Proposed (not yet built)

From the full-app review — checked against the "done" list above and
`FUTURE_FEATURES.md` (Verifactu) to avoid overlap.

- **Recurring expense detection** — mirror the existing recurring-*invoice* nudge
  (`src/lib/recurring.ts`) for expenses that repeat monthly (rent, software
  subscriptions).
- **Overdue invoice OS notification** — the aging card (task 1) is passive, only
  visible if the Dashboard is open; a native macOS notification when an invoice
  crosses overdue would close that loop.
- **Client statement PDF** — the running balance above is already computed
  (`clientBalance`) but only shown on-screen; export it as a formatted PDF for a
  client who asks "what do I owe you."
- **Bulk actions on Facturas/Gastos lists** — multi-select to mark several
  invoices paid, or export several receipts, at once.
- **Full data export/import (JSON)** — for moving to a new Mac. The current
  backup is folder-based and tied to the macOS app-data directory, not a
  portable single-file migration path.
- **In-app update checker** — via `tauri-plugin-updater`; there's currently no
  update mechanism for a non-App-Store distributed app.
