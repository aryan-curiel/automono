# AutoMono

A native macOS app for Spanish freelancers (_autónomos_) to run their own back office: clients,
contracts, invoices, expenses and quarterly tax summaries — instead of spreadsheets or a SaaS
subscription. Everything lives in a local SQLite database on your Mac.

> **⚠️ Not tax advice.** AutoMono helps you keep your books, but its IVA, IRPF and _modelo_
> calculations are indicative and may contain errors or fall behind regulatory changes. Always
> check the figures with your _gestor_ or tax advisor before filing anything with the AEAT. The
> software is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)).
>
> AutoMono is **not** yet certified for [Verifactu](docs/FUTURE_FEATURES.md).

## Features

- **Invoices** — numbered series, NIF/CIF validation, IVA and IRPF, rectifying invoices
  (_facturas rectificativas_), PDF generation with your logo, Spanish and English invoices.
- **Recurring billing** — set a billing cadence on a contract and AutoMono drafts the next invoice
  when it's due.
- **Payments** — partial payments, overdue tracking, late-payment interest (Ley 3/2004) and bank
  statement CSV reconciliation.
- **Quotes** (_presupuestos_) that turn into invoices.
- **Expenses** — attach receipts, a watched receipt inbox folder, and receipt field extraction
  (built-in for PDFs, optional AI for photos).
- **Quarterly and annual summaries** — figures for Modelo 303, 130 and 111, plus 347/349 helpers,
  with filing-deadline reminders.
- **Handoff to your gestor** — export a period's invoice PDFs, receipts and a CSV summary.
- **Backups** — scheduled local backups with retention and integrity checks.
- **Optional AI assistant** — ask questions about your own figures using your own API key.

The interface is in Spanish (default) and English.

## Install

Download the latest `.dmg` from [Releases](../../releases), open it and drag AutoMono to
Applications.

Your data is stored in `~/Library/Application Support/com.nagarestudio.automono/` — the database
plus your attached contracts and receipts, organised by tax year. Set up a backup folder in
**Ajustes → Copia de seguridad** and keep it somewhere that's backed up (iCloud Drive, an external disk…).

## Privacy

AutoMono has no account, no server and no telemetry. See [PRIVACY.md](PRIVACY.md) for the full
list of what can leave your machine and when (only the optional AI features and web fonts).

## Building from source

Requirements: [Bun](https://bun.sh), [Rust](https://rustup.rs) (stable), and Xcode Command Line
Tools.

```sh
bun install
bun run tauri dev     # run the app with hot reload
bun run tauri build   # produce a .app and .dmg in src-tauri/target/release/bundle/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests, project layout and conventions.

## License

[GNU AGPL-3.0-or-later](LICENSE). You may use, modify and redistribute AutoMono, but if you
distribute a modified version — or offer it to others over a network — you must publish your
source under the same license.
