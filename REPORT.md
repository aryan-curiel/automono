# AutoMono — Deep Review

Date: 2026-09-01
Scope: full repo (Rust backend, React frontend, tax logic, migrations, UI, AI) at current working tree.

Severity tags: **[P0]** filing-correctness / data-loss · **[P1]** wrong-but-recoverable · **[P2]** polish / perf · **[P3]** nice-to-have.

---

## 1. Executive summary

The app is in good shape structurally: clean two-runtime split, migrations guarded by a test, tax math centralised in `src/lib/`, snapshots frozen per declaration. The risks that matter are concentrated in **three places**:

1. **Cash-basis vs. accrual-basis inconsistency** in the quarterly declaration — the number the user previews is not the number the wizard freezes, and neither matches the default Spanish tax regime.
2. **The Rust invoice-issue path stores unrounded floating-point money** while the rest of the app rounds to the cent — this leaks into the gestor CSV and the invoice PDF.
3. **Modelo 130 is a rough per-quarter estimate presented as an "expected" value** to check a real filing against.

Everything else is incremental.

---

## 2. Tax correctness

### 2.1 [P0] Cash vs. accrual basis mismatch across the declaration flow

- `ResumenTrimestral` projection KPIs use `invoicesInPeriod` — all non-draft invoices (accrual). `src/screens/ResumenTrimestral.tsx:347`
- `DeclarationWizard` and the frozen `QuarterlyDeclaration` snapshot use `paidInvoicesInPeriod` — `status === "paid"` only (cash). `src/components/DeclarationWizard.tsx:97`, `src/lib/quarterlyDeclaration.ts:21-32`
- `Dashboard` trend/IVA cards use `invoicesInPeriod` (accrual). `src/screens/Dashboard.tsx:176,211`

Spanish **Modelo 303 (IVA)** and **Modelo 130 (IRPF pago fraccionado)** are accrual/*devengo* by default — an issued invoice counts in the quarter it was issued regardless of whether it was collected. Only autónomos who explicitly opted into *criterio de caja* use cash basis.

Consequences:
- The user sees €X in the projection, clicks "Iniciar declaración", and the wizard shows a smaller €Y (issued-unpaid invoices dropped) with no explanation.
- The frozen snapshot under-reports revenue and output IVA vs. what AEAT expects for the default regime.
- `netIrpfIncome`, `margin`, `expectedCasillas("130")`, and `expectedCasillas("303")` all cascade from the wrong base.

Fix: make **accrual (issued + paid) the default** everywhere; add an explicit "Criterio de caja" toggle in Ajustes that switches the filter (and label the frozen snapshot with which basis it used). Add a test asserting the projection basis equals the wizard basis.

### 2.2 [P0] Rust `issue_invoice` / `create_rectification` store unrounded money

`src-tauri/src/invoicing.rs:132-143` and `:322-325`, `:360`:

```rust
let subtotal: f64 = lines.iter().map(|r| quantity * unit_price).sum();
let iva_amount = subtotal * iva_rate / 100.0;   // not rounded
let irpf_amount = irpf_rate.map(|rate| subtotal * rate / 100.0); // not rounded
let total = subtotal + iva_amount - irpf_amount.unwrap_or(0.0);  // not rounded
```

Every other code path rounds through `roundCents` / `amountsFromSubtotal` (`src/lib/invoice.ts:21`). The stored values here feed:
- the frozen declaration snapshot and the gestor CSV export (`buildDeclarationCsv`),
- the invoice **PDF** — the legal artifact (`src-tauri/src/pdf.rs:801-806`, reads `subtotal`/`iva_amount`/`total` straight from the row),
- `listInvoices` which prefers the stored value over `derived` for issued invoices (`src/db/invoices.ts:355-359`).

`format_eur` masks it on screen (`{:.2}`), but the arithmetic identity `subtotal + iva − irpf = total` can be off by a cent, and the CSV the accountant reconciles will carry `299.99999999`.

Fix: round `subtotal`, `iva_amount`, `irpf_amount`, `total` and each line total to 2 decimals in Rust, matching `amountsFromSubtotal`'s order of operations (round subtotal first, then derive).

### 2.3 [P1] Modelo 130 `pagoFraccionado` is a per-quarter approximation shown as "expected"

`src/lib/modeloReport.ts:50-60`:

```ts
const pagoFraccionado = Math.max(0, totals.netIrpfIncome * 0.2 - totals.irpfWithheld);
```

The real Modelo 130 is **cumulative across the tax year**:
- rendimiento neto YTD × 20%
- minus retenciones YTD
- minus **prior quarters' own pagos fraccionados**
- minus the **2% "gastos de difícil justificación"** deduction (capped €2,000/year)
- floored (a negative result is carried forward, not refunded quarterly)

There is a `ponytail:` comment acknowledging this, but the value is rendered in `ModeloReviewModal` next to the user's uploaded real form as the column headed "expected" with match/mismatch status. A legitimate filing will show as a **mismatch**, which reads as "AutoMono thinks my gestor is wrong."

Fix: either (a) track year-to-date declaration state and compute 130 properly, or (b) relabel the 130 rows explicitly as "estimación (trimestre aislado)" and drop the match/mismatch badge for them.

### 2.4 [P1] Modelo 303 `resultadoLiquidacion` ignores prior-period compensation

`src/lib/modeloReport.ts:43-47` expects `resultado = ivaDevengado − ivaDeducible`. Real 303 subtracts *cuotas a compensar de periodos anteriores* (casilla 78/87) and applies annual regularisation. Same "informational" caveat as 2.3 — surface it or account for it.

### 2.5 [P2] Modelo 111 flow is likely noise for the target user

`expectedCasillas("111")` sums `e.amount` for expenses where `irpfAmount > 0`. Modelo 111 is for retentions the autónomo **practices** when paying employees / other professionals. A solo autónomo with no payroll rarely files 111. Consider making 111 opt-in rather than a default third modelo in every quarter's checklist.

### 2.6 [P2] Tax-deadline calendar edge cases

`src/lib/taxCalendar.ts`:
- `nextTaxDeadlines` emits both `130/303` and `190/390` dated 30 Jan for Q4 — two rows the same day.
- No weekend / holiday roll-forward: if the 20th falls on a Saturday the real deadline is the next business day.

Low stakes (the dates are close enough to prompt action) but worth a pass if you build reminders (see 8.1).

### 2.7 [P2] `IRPF_DEFAULT_RATE = 7` is hardcoded forever

`src/features/clients/taxDefaults.ts:35`. The 7% reduced rate applies only for the year of alta + the next two. You already store `retaStartDate` in preferences — compute whether the reduced window is still open and default to 7 or 15 accordingly, instead of relying on the user to remember to change it in year 4.

---

## 3. Rust backend

### 3.1 [P1] `backup_on_close` does a full recursive file copy on every quit

`src-tauri/src/backup.rs:155-171` → `run_backup` → `copy_dir_recursive` over `contracts/ expenses/ invoices/ declarations/ documentos_autonomo/ branding/` on **every window close**, blocking shutdown up to 10s. Each backup is a fresh full copy (`backup-<timestamp>/`), so with a few tax years of receipts this is hundreds of MB re-copied per quit and grows unbounded until retention prunes.

Fix options (cheapest first):
- On close, back up only the DB (`VACUUM INTO`); copy the file trees on the daily `checkAutoBackup` / explicit "Backup now" only.
- Make `copy_dir_recursive` skip files whose destination already exists with matching size + mtime (incremental).
- Hardlink unchanged files from the previous `backup-*` folder.

### 3.2 [P1] `restore_backup_cmd` wipes live data before validating the source

`src-tauri/src/backup.rs:213-223`: for each subdir it does `remove_dir_all(dst)` then `copy_dir_recursive(src, dst)`. If the backup folder is partial/corrupt (a prior backup interrupted mid-copy left `expenses/` present-but-empty), you delete good data and replace it with nothing. Only the DB file presence is checked up front.

Fix: restore into a temp dir, verify (DB opens, expected subdirs non-empty or a manifest checksum matches), then atomically swap.

### 3.3 [P2] Restore needs a manual restart with no prompt in the Rust layer

`restore_backup_cmd` calls `pool.close()` and overwrites the DB file; nothing reopens the pool. Verify the frontend forces a relaunch — if not, the next query fails silently. Also the DB is written to `app_config_dir()` while attachments live under `app_data_dir()`; identical on macOS, divergent elsewhere — fine for a macOS-only app but leave a comment.

### 3.4 [P2] `ANTHROPIC_MODEL = "claude-opus-4-8"` is hardcoded and stale

`src-tauri/src/llm.rs:15`. Current generation is the Claude 5 family (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`). Two problems:
- **Cost**: Opus for "extract 6 fields off a receipt" is heavy overkill. `claude-haiku-4-5` (or `claude-sonnet-5` for the trickier Modelo 303 box-summing) would be materially cheaper at effectively equal accuracy for this task.
- **No UI**: only OpenRouter exposes a model field (`src/db/llmSettings.ts`); Anthropic/OpenAI model is compile-time only.

Fix: default Anthropic to `claude-haiku-4-5`, expose a model override for all three providers in Ajustes, keep the 303 extraction on a stronger model if box-summing accuracy drops.

### 3.5 [P2] `extract_modelo_fields_cmd` swallows LLM failures silently

`src-tauri/src/modelo_review.rs:237-244`: `if let Ok(mut fields) = llm::extract(...)` — on any error it falls through to the regex scanner with no signal. `receipt_extract` logs its fallback; do the same here, and ideally surface "checked with basic extraction only" in `ModeloReviewModal` so the user knows the numbers are weaker.

### 3.6 [P2] Renderer-controlled absolute paths in file commands

`delete_expense_files_cmd` (`src-tauri/src/expenses.rs:41-47`) `fs::remove_file`s any path it's given; `open_*_file_cmd` opens any path with the system opener. Args currently come from trusted DB values, but a cheap guard — assert the path is under `app_data_dir()` — closes the hole for the cost of two lines.

### 3.7 [P3] Migration filename ↔ version gap

There is no `0021_*.sql`; `0022_expense_irpf_retention.sql` is registered as `version: 21` (`src-tauri/src/lib.rs:150`). The guard test (`all_sql_files_are_registered_as_migrations`) only checks *sequential versions* + *count*, not that file `NNNN` maps to `version N`. Harmless today. Either rename the file to `0021_…` or tighten the test to assert `filename number == version`, so a real off-by-one can't slip through later.

### 3.8 [P3] API keys stored plaintext in SQLite

`llm_settings` table. Acceptable for a single-user local app; the proper home is the macOS Keychain (`keyring` crate). Note it.

---

## 4. Frontend / React

### 4.1 [P2] `listInvoices()` refetches on every screen change

`src/App.tsx:200-205` — `useEffect(..., [dbReady, screen])`. Every navigation re-queries and re-maps all invoices with their line-subtotal `GROUP BY`. You already refresh `invoices` after every mutation (`setInvoices(await listInvoices())`), so the `screen` dependency is redundant work that scales with invoice count.

### 4.2 [P2] `Dashboard` recomputes ~20 derived structures every render, unmemoized

`src/screens/Dashboard.tsx:126-297` builds `ivaInvoicedByQuarter`, `grossInvoicedByQuarter`, `paidByQuarter`, `categoryTrendByQuarter`, etc. — several full `invoicesInPeriod` scans × 4 quarter keys, plus category filters — with no `useMemo`. Re-runs on any parent re-render. Wrap the heavy blocks in `useMemo` keyed on `invoices` / `recentExpenses`.

### 4.3 [P2] Three expense queries per quarterly screen

`ResumenTrimestral` fires `listExpenses` for the current period and the prior-year period (`:330-345`), and `DeclarationWizard` fires a third for the same current period (`:74-81`). Lift the current-period expenses into a prop or a shared hook.

### 4.4 [P2] `Dashboard`/`ResumenTrimestral` "current quarter" constants freeze at module load

`Dashboard.tsx:43-46`, `ResumenTrimestral.tsx:84` — `CURRENT_KEY` computed once when the module is imported. A session left open across a quarter (or day) boundary shows a stale "current". Compute inside the component or on a low-frequency timer.

### 4.5 [P2] `GastoForm.attachFromPath` `useCallback` depends on `form`

`src/screens/GastoForm.tsx:169-260` — `[form, t]` deps mean the callback is recreated on every keystroke; the `initialFilePath` effect that depends on it is only kept from re-firing by `initialFileHandledRef`. Works, but brittle. Depend on the specific fields you read (`form.date`, `form.description`, `form.category`) or read them from a ref.

### 4.6 [P3] `formatDate` double-guards

`formatDate(iso: string | null)` already returns `"—"` for null, but callers pre-coalesce with `?? ""` (e.g. `ResumenTrimestral.tsx:699`, `:547` path), producing `"//"`. Pass the nullable through directly.

### 4.7 [P3] `agingReport` is dead code

Defined + tested in `src/lib/analytics.ts:56` but not rendered anywhere (`Dashboard` "upcoming due" is a plain `slice` of issued invoices, not aged). Either surface it (an aging card is genuinely useful — see 8.7) or delete it.

### 4.8 [P3] Recharts + `motion/react` for 3 simple charts

`QuarterTrendChart` / `QuarterBarChart` / `StackedQuarterBarChart` are bar+line on 4 data points. Recharts + d3 is the bulk of the JS bundle in an app that loads from local disk. You already hand-roll the axis ticks as raw SVG — the charts themselves are ~80 lines of SVG each. Not urgent (bundle size doesn't matter much for a Tauri app), but it's pure dependency weight.

---

## 5. UI / UX

- **[P1]** The projection→declaration number change (§2.1) needs an in-UI explanation ("La declaración solo incluye facturas cobradas" — once you've decided the basis).
- **[P2]** ~5 hand-rolled `role="button"` clickable rows with manual `onKeyDown` across `Dashboard` and `ResumenTrimestral`. The git history shows repeated review churn on exactly this (keyboard access, click target, focus ring). Extract one `<ListRow>` primitive in `components/ui/` and route them all through it.
- **[P2]** `QuarterTrendChart` working-tree edit removed the `y=0` `ReferenceLine` — a chart with negative net now has no visual baseline. Keep the zero line when `data.some(d => d.net < 0)`.
- **[P2]** First-run Dashboard is all "Sin datos" cards with no guidance toward "create your first client / invoice". An empty-state with a CTA per section (or a collapsed dashboard until there's data) would land better.
- **[P3]** `KpiTile` deltas on the Dashboard compare against `prevQuarterKey` even when the previous quarter is before the RETA alta date (partial/zero) — the delta reads as a huge swing. Suppress the delta when the comparison quarter predates `altaKey`.
- **[P3]** No visible "unsaved changes" guard on `GastoForm` / `FacturaNueva` when navigating away.

---

## 6. AI / LLM

- **[P1]** Model cost + staleness (§3.4).
- **[P2]** Silent LLM-failure fallback in modelo review (§3.5).
- **[P2]** `fix_303_devengado_if_misread` (`modelo_review.rs:204`) is a post-hoc arithmetic patch compensating for an LLM misread of casilla 27 vs 45. A structured re-ask ("you returned equal values for 27 and 45, re-derive each from its own sub-boxes") or a couple of few-shot examples in the preamble would be more robust than re-deriving from `resultado_liquidacion`.
- **[P3]** Full PDF/image base64 is re-sent on every extraction / re-review — no caching. Re-attaching or reopening the review re-bills.
- **[P3]** The AI surface is extraction-only. `user_context.rs` + `synthesize_user_context_cmd` already exist and are unused by any user-facing feature — the scaffolding for a grounded assistant is half-built (see 8.9).

---

## 7. Security / data-safety

- **[P1]** CSV formula injection: `src/lib/csv.ts` quotes `" , \n \r` but does not neutralise a leading `= + - @`. The gestor CSV includes free-text client names and expense descriptions and is opened in Excel. Prefix any field matching `/^[=+\-@]/` with a `'` (or a leading space).
- **[P1]** `restore_backup` wipes-then-copies without validating the source (§3.2).
- **[P2]** Renderer-controlled paths in `delete_expense_files_cmd` / `open_*_file_cmd` (§3.6).
- **[P3]** Plaintext API keys in SQLite (§3.8).

---

## 8. Potential features / roadmap

Ordered by leverage for a solo Spanish autónomo.

### 8.1 Filing-deadline reminders (highest leverage)
OS notifications 7 / 3 / 1 days before each obligation (20th of month, 30 Jan), driven by the user's actual regime. Pair with the per-quarter checklist you already render ("303 ✓ / 130 ✓ / 111 —"). This is the one feature that turns a spreadsheet replacement into a thing you can't file late with.

### 8.2 Proper cumulative Modelo 130
YTD rendimiento neto, prior pagos fraccionados, prior retenciones, the 2% gastos-difícil-justificación deduction (€2,000/yr cap), negative-result carry-forward. Requires the declaration store to hold year-to-date state (§2.3).

### 8.3 Criterio de caja toggle (done properly)
You're already half-way — one `paidInvoicesInPeriod` vs `invoicesInPeriod` switch, plus a payment-date field for expenses, plus labelling the frozen snapshot with its basis.

### 8.4 Modelo 349 (intracomunitarias)
You already tag `reverse_charge_eu` clients and snapshot `client_country`. A quarterly 349 summary (client VAT number + total base per client) is a near-free derived output.

### 8.5 Modelo 347 (operaciones con terceros > €3.005,06/año)
Derivable from invoices grouped by client + expenses grouped by provider over a calendar year. Annual, informative, currently a manual chore.

### 8.6 Real recurring invoices
Replace the "invoiced last month, not this" heuristic (`src/lib/recurring.ts`) with a billing-cadence field on the contract, auto-drafting on schedule with a reminder. `duplicateInvoice` already does the line copy.

### 8.7 Aging / collections
Surface the existing `agingReport`. Add: mark partial payments, record payment date, generate a payment-reminder email, and a Ley 3/2004 late-interest claim letter (`lateInterest.ts` exists but nothing shows it).

### 8.8 Bank reconciliation
Import a bank CSV, match credits to issued invoices (amount + date + reference), auto-mark paid with the real payment date — which also feeds 8.3 and 8.7.

### 8.9 Grounded tax assistant (AI)
A chat grounded in the SQLite DB + `contexto_usuario.md`: "¿cuánto llevo facturado a X este año?", "¿me interesa comprar el portátil este trimestre o el que viene?", "¿qué me falta para cerrar el 3T?". The `user_context` scaffolding is already there.

### 8.10 Modelo pre-fill (AI, with disclaimer)
Instead of only *checking* an uploaded modelo PDF, output the casilla values to type into AEAT's form — the inverse of the current review flow, reusing `expectedCasillas`.

### 8.11 Expense anomaly detection (AI or rules)
"IVA deducible this quarter is 3× your 4-quarter average — possible duplicate receipt" / "this provider's retention rate (15%) looks wrong for a supplies invoice".

### 8.12 Contract → recurring invoice extraction (AI)
Extract amount / cadence / IRPF / IVA treatment from an attached contract PDF (you already attach and store them) and pre-fill the recurring invoice.

### 8.13 Receipt inbox
Watch a folder (or a forwarding email address) for receipts, auto-extract, queue as draft expenses for one-tap confirm. Menu-bar / dock-drop quick-add.

### 8.14 Annual views
Multi-year revenue dashboard, annual P&L, an IRPF (Renta) estimate, expense budget-vs-actual by category.

### 8.15 Presupuestos (quotes)
Quote → accepted → invoice conversion, with the quote as a non-fiscal PDF template alongside the invoice template.

---

## 9. Test gaps worth closing

- Assert `ResumenTrimestral` projection basis == `DeclarationWizard` frozen basis (would have caught §2.1).
- Rust test: issued invoice amounts are cent-rounded and `subtotal + iva − irpf == total` exactly (§2.2).
- Tighten `all_sql_files_are_registered_as_migrations` to check filename number == version (§3.7).
- `restore_backup` with a partial/empty source directory does not destroy live data (§3.2).
- CSV export escapes formula-trigger characters (§7).
