# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AutoMono is a native-feeling macOS desktop app (Tauri 2 + React 19 + SQLite) that replaces spreadsheets/SaaS invoicing for a single Spanish freelancer (autónomo): clients, contracts, invoices (Spanish tax rules — NIF/CIF, IVA, IRPF), expenses, and quarterly (trimestral) tax summaries. See `PRODUCT.md` for brand/design principles (locked terracotta accent, native macOS fidelity, no responsive/mobile patterns) and `docs/PRD.md` for full product requirements. `docs/FEATURES.md` / `docs/FUTURE_FEATURES.md` track the roadmap (FUTURE_FEATURES.md is Verifactu/regulatory compliance work, longer-term).

## Commands

A `justfile` wraps the common tasks (`just` lists them): `just test` / `just lint` cover both runtimes, `just bump <version>` sets the version in `package.json`, `tauri.conf.json` and `Cargo.toml`, `just backup` snapshots the app-data folders to `~/AutoMono-backups/`, `just install` backs up, builds and replaces `/Applications/AutoMono.app`, and `just release` tags the current version as `v<version>` and pushes it (the only thing that triggers the macOS build workflow).

Package manager is **bun** (`bun.lock` present) — use `bun run <script>` / `bun install`, not npm/yarn.

- `bun run dev` — Vite dev server only (frontend). For the full app, use `bun run tauri dev` (Tauri window + hot reload).
- `bun run build` — `tsc` + Vite build (frontend only; use `bun run tauri build` for a full app bundle).
- `bun run test` — Vitest, runs once (`vitest run`). For a single file: `bun run test src/lib/analytics.test.ts`. For a single test: add `-t "test name"`.
- `bun run lint` — ESLint over the whole repo.
- `bun run format` — Prettier write.
- Rust backend: `cd src-tauri && cargo test` (tests are inline `#[cfg(test)] mod tests` blocks per file, e.g. `backup.rs`, `branding.rs`, `contracts.rs`). `cargo check` for a fast type-check without building.

## Architecture

**Two runtimes, one SQLite DB.** The Rust side (`src-tauri/src/`) owns the SQL migrations and any filesystem/PDF work; the frontend (`src/`) talks to SQLite directly via `@tauri-apps/plugin-sql` (`src/db/client.ts` → `Database.load("sqlite:automono.db")`) for all CRUD, and calls Rust only for things JS can't do: file attach/copy, PDF generation, backups, receipt text extraction. Business logic (validators, tax math, formatting) lives in `src/lib/` and `src/features/*/`, not in Rust — Rust is IO/OS-boundary only.

**Migrations are the single source of truth for schema, and must be registered in two places that don't cross-check each other:**

- SQL files live in `src-tauri/migrations/NNNN_description.sql`, numbered sequentially.
- They must be added to `all_migrations()` in `src-tauri/src/lib.rs` (Rust runtime, in-order `Migration` structs consumed by `tauri-plugin-sql`) — a file that exists on disk but isn't listed here **silently never runs** in production and causes cryptic "no such column" errors at query time, not at startup. A Rust test (`all_sql_files_are_registered_as_migrations`) guards against this gap now; keep it green when adding migrations.
- `src/db/migrations.test.ts` independently re-scans the `migrations/` directory and replays every `.sql` file against an in-memory `node:sqlite` DB for frontend-side schema tests — it does NOT read `all_migrations()`, so it won't catch a registration gap in the Rust list.
- SQLite can't do certain `ALTER TABLE` operations (add NOT NULL FK column, drop column) in one step — the established pattern for that is: create a new table, `INSERT ... SELECT` to copy data across, `DROP` the old table, `RENAME` the new one to the old name. See `0013_rectification_numbering.sql` and `0016_invoice_series.sql` for the reference implementation. Never drop a table without copying its data forward first.
- Because the Tauri app identifier (`com.nagarestudio.automono` in `tauri.conf.json`) is what determines the OS-level app-data directory, it must never change — doing so would orphan the existing database and all attached files on the next update. It was renamed once from `com.aryancuriel.automono`; `legacy_data.rs` copies that old folder across on first launch and rewrites the absolute file paths stored in the DB (also after restoring an old backup). `keychain.rs` likewise moves API keys from the old Keychain service name on first read.

**Filesystem layout mirrors tax-year bookkeeping.** All attached files (contracts, expense receipts, business logo) are copied into `app_data_dir()` under per-year folders (e.g. `expenses/<year>/receipts/`, `contracts/<year>/<client_id>/`), named `<date>_<note-or-original-name>.<ext>` where `<date>` is the record's business date (expense date / contract start date), not the attach time — this makes the app-data folder itself a browsable, accountant-readable archive. See `contracts.rs`/`expenses.rs`/`branding.rs` for the shared `copy_into`-style helpers.

**Frontend structure:**

- `src/screens/` — one screen per route, Spanish-named to match the product's UI language (`Facturas`, `Clientes`, `Gastos`, `ResumenTrimestral`, `Ajustes`, etc.), wired up in `src/App.tsx` via a `Screen` union type (no router library — plain state-driven view switching).
- `src/db/` — one module per entity (`clients.ts`, `invoices.ts`, `contracts.ts`, `expenses.ts`, `businessProfile.ts`, `backup.ts`, `export.ts`) — each wraps raw SQL against `getDb()`.
- `src/features/<entity>/` — pure validators and business rules (e.g. tax defaults, form validators) kept separate from the `db/` data-access layer and from `screens/` presentation.
- `src/lib/` — cross-cutting pure logic: date ranges, CSV, formatting, analytics, late-payment interest (Ley 3/2004), recurring-invoice detection, tax calendar, search/command-palette indexing.
- `src/components/ui/` — design-system primitives (built on Radix where interactive: dialog, dropdown, select, switch, tooltip) — reuse these rather than reaching for Radix directly in a screen.
- i18n via `react-i18next`, locale JSON in `src/locales/{en,es}/common.json` — Spanish is the primary/default language for this user base.

**Rust backend (`src-tauri/src/`):** `lib.rs` (Tauri setup, migrations, command registration) · `invoicing.rs` (issue/rectify invoices, numbering) · `pdf.rs` (PDF generation via `genpdf`) · `receipt_extract.rs` (PDF receipt text scraping via `pdf-extract`, hand-rolled field parsing — no OCR/LLM, deliberately deferred) · `contracts.rs` / `expenses.rs` (file attach commands) · `branding.rs` (logo upload) · `backup.rs` (backup/restore, retention policies) · `export.rs` (accountant handoff bundle: invoice PDFs + receipts + CSV summary for a period).

## Design constraints (from PRODUCT.md — enforce when touching UI)

- One accent color only (locked terracotta, light/dark values) — never introduce a second accent.
- No responsive breakpoints or mobile nav — this is a native macOS window, not a webapp.
- Glassmorphism/translucency only where there's real scrolling content behind it (toolbars, sheets, menus); sidebar and other static surfaces stay opaque.
- Motion is functional, not decorative — springs for sliding selection / sheet entrances only, never bouncy/elastic, and must respect `prefers-reduced-motion` (check both themes when changing motion or color).
