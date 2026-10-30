# AutoMono

A native macOS app for Spanish freelancers (_autónomos_) to run their own back office: clients,
contracts, invoices, expenses and quarterly tax summaries — instead of spreadsheets or a SaaS
subscription. Everything lives in a local SQLite database on your Mac. No account, no server, no
telemetry.

[![CI](https://github.com/aryan-curiel/automono/actions/workflows/ci.yml/badge.svg)](https://github.com/aryan-curiel/automono/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/aryan-curiel/automono)](https://github.com/aryan-curiel/automono/releases/latest)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)

> **⚠️ Not tax advice.** AutoMono helps you keep your books, but its IVA, IRPF and _modelo_
> calculations are indicative and may contain errors or fall behind regulatory changes. Always
> check the figures with your _gestor_ or tax advisor before filing anything with the AEAT. The
> software is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)).
>
> AutoMono is **not** yet certified for [Verifactu](docs/FUTURE_FEATURES.md).

## Features

- **Invoices** — numbered series, NIF/CIF/VAT validation, IVA and IRPF, intra-EU and export
  invoices, rectifying invoices (_facturas rectificativas_), PDFs with your logo in Spanish or
  English. Issued invoices are locked.
- **Recurring billing** — set a billing cadence on a contract and AutoMono drafts the next invoice
  when it's due. It can read the terms from the contract file.
- **Quotes** (_presupuestos_) that turn into invoices.
- **Payments** — partial payments, overdue tracking, reminders, late-payment interest (Ley 3/2004)
  and bank statement CSV reconciliation.
- **Expenses** — attach receipts, drop files into a watched receipt inbox, automatic field
  extraction (built-in for PDFs, optional AI for photos), categories, deductible IVA % and
  anomaly warnings.
- **Quarterly and annual summaries** — figures for Modelo 303, 130 and 111 with AEAT box
  (_casilla_) pre-fill, accrual or cash basis (_criterio de caja_), 347/349 helpers, a Renta
  estimate and filing-deadline notifications.
- **Handoff to your gestor** — export a period's invoice PDFs, receipts and a CSV summary.
- **Backups** — scheduled local backups with retention and integrity checks, plus an automatic
  backup before every update.
- **Optional AI assistant** — ask questions about your own figures with your own Anthropic,
  OpenAI or OpenRouter API key.
- Spanish (default) and English interface, light and dark mode.

## Install

1. Download the latest `.dmg` from [Releases](https://github.com/aryan-curiel/automono/releases/latest).
2. Open it and drag **AutoMono** to **Applications**.
3. Launch it and follow the onboarding to enter your business details.

Builds are universal (Apple silicon and Intel), signed and notarized. AutoMono checks for updates
on its own and backs up your data before installing one.

Your data lives in `~/Library/Application Support/com.nagarestudio.automono/`: the database plus
your contracts and receipts, organised by tax year so the folder itself is readable by your
accountant. Set up a backup folder in **Ajustes → Copia de seguridad** somewhere that's backed up
(iCloud Drive, an external disk…).

## Documentation

| Document                             | For                                                         |
| ------------------------------------ | ----------------------------------------------------------- |
| [User guide](docs/user-guide.md)     | Using the app, screen by screen                             |
| [Tax rules](docs/tax-rules.md)       | How every tax figure is calculated, with code references    |
| [Architecture](docs/architecture.md) | How the code fits together, data model, Tauri commands      |
| [Development](docs/development.md)   | Building, testing, debugging and releasing                  |
| [Contributing](CONTRIBUTING.md)      | How to propose changes and the rules that are easy to break |
| [Privacy](PRIVACY.md)                | Exactly what can leave your Mac, and when                   |
| [Security](SECURITY.md)              | Reporting vulnerabilities                                   |
| [Changelog](CHANGELOG.md)            | What changed in each release                                |

See [docs/README.md](docs/README.md) for the full index, including product and design documents.

## Building from source

Requirements: macOS, [Bun](https://bun.sh), [Rust](https://rustup.rs) (stable) and Xcode Command
Line Tools.

```sh
git clone https://github.com/aryan-curiel/automono.git
cd automono
bun install
bun run tauri dev     # run the app with hot reload
```

To build your own unsigned `.app`, see [Building the app locally](docs/development.md#building-the-app-locally).
Note that a development build reads and writes the same data folder as an installed copy.

## Tech stack

[Tauri 2](https://tauri.app) (Rust) · React 19 · TypeScript · Vite · Tailwind CSS 4 · Radix UI ·
SQLite · i18next · Vitest.

The frontend talks to SQLite directly and holds all business and tax logic; Rust handles only what
the web view can't: files, PDFs, backups, the Keychain and calls to AI providers.

## Contributing

Bug reports, tax-rule corrections and pull requests are welcome. AutoMono handles real tax data,
so correctness beats features — read [CONTRIBUTING.md](CONTRIBUTING.md) first. If you spot a wrong
tax calculation, use the **Tax rule** issue template and cite the source.

Please follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

[GNU AGPL-3.0-or-later](LICENSE). You may use, modify and redistribute AutoMono, but if you
distribute a modified version — or offer it to others over a network — you must publish your
source under the same license.
