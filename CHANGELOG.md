# Changelog

Notable changes to AutoMono. Versions follow [Semantic Versioning](https://semver.org/); dates are
release dates.

## [Unreleased]

## [1.1.0] — 2026-10-30

### Added

- Automatic updates from GitHub Releases. AutoMono takes a backup before installing an update.
- Releases are signed with a Developer ID and notarized by Apple, so macOS opens them without a
  warning.
- **Ajustes → Acerca de** shows the installed version.

### Changed

- The app identifier is now `com.nagarestudio.automono`. On first launch, data from the old
  `com.aryancuriel.automono` folder and Keychain entries are moved across automatically, including
  file paths inside restored backups.
- The project is open source under AGPL-3.0-or-later.

### Fixed

- Recurring invoices could be drafted twice for the same period.
- The main window can be closed and reopened without errors.

## [1.0.0] — 2026-09-02

First complete version.

- Clients, contracts and invoices with numbered series, NIF/CIF/VAT validation, IVA, IRPF and
  rectifying invoices; PDFs in Spanish and English with your logo.
- Recurring billing from contracts, with term extraction from the contract file.
- Quotes (_presupuestos_) that convert into invoices.
- Payments: partial payments, overdue tracking, reminders, Ley 3/2004 late-interest letter and bank
  statement CSV reconciliation.
- Expenses with receipts, a watched receipt inbox, receipt field extraction, categories, IRPF
  retention, deductible IVA % and anomaly detection.
- Quarterly declarations (Modelo 303, 130, 111) with a wizard, AEAT casilla pre-fill, accrual or
  cash basis (_criterio de caja_), and filing-deadline notifications.
- Annual views: multi-year dashboard, P&L, Renta estimate, Modelo 347 and 349 helpers.
- Accountant handoff export, scheduled backups with retention and integrity checks.
- Optional AI tax assistant and document extraction with your own API key, stored in the Keychain.
- Spanish and English interface, light and dark mode.

[Unreleased]: https://github.com/aryan-curiel/automono/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/aryan-curiel/automono/releases/tag/v1.1.0
[1.0.0]: https://github.com/aryan-curiel/automono/commits/main
