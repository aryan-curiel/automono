# Contributing

Thanks for helping. AutoMono handles real tax data, so correctness beats features: a small,
well-tested fix is worth more than a big untested one.

## Setup

You need [Bun](https://bun.sh), [Rust](https://rustup.rs) (stable) and Xcode Command Line Tools.

```sh
bun install
bun run tauri dev
```

## Checks (CI runs all of these on every pull request)

```sh
bun run lint
bun run test                    # Vitest; one file: bun run test src/lib/recurring.test.ts
bun run build                   # tsc + Vite
cd src-tauri && cargo test      # Rust tests (inline #[cfg(test)] modules)
```

## Project layout

- `src/screens/` — one screen per route (Spanish names match the UI).
- `src/db/` — SQL data access, one module per entity.
- `src/lib/`, `src/features/` — pure business logic: tax math, validators, formatting. Put new
  logic here, with tests, rather than in screens or in Rust.
- `src-tauri/src/` — Rust only for what the frontend can't do: files, PDFs, backups, Keychain,
  AI provider calls.
- `src/locales/{es,en}/common.json` — every user-facing string. Spanish is the default; add both.

[docs/architecture.md](docs/architecture.md) has the full architecture walkthrough and
[docs/development.md](docs/development.md) covers common tasks (migrations, screens, Tauri
commands) and debugging.

> `tauri dev` uses the same data folder as an installed AutoMono. Back up first (`just backup`)
> if you use the app for your real books.

## Rules that are easy to break

- **Migrations:** add `src-tauri/migrations/NNNN_description.sql` (next number) **and** register it
  in `all_migrations()` in `src-tauri/src/lib.rs`. A file that isn't registered never runs. Never
  edit a migration that has already shipped.
- **Never drop data in a migration.** For changes SQLite can't do in place, use create new table →
  copy → drop → rename (see `0016_invoice_series.sql`).
- **Don't change the app identifier** in `tauri.conf.json`. It decides where user data lives.
- **Issued invoices are immutable** (enforced by a DB trigger). Corrections go through rectifying
  invoices.
- **Design:** read [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) before UI changes. One
  accent color, native macOS look, no responsive/mobile patterns, respect reduced motion, and check
  light and dark mode.

## Tax logic changes

[docs/tax-rules.md](docs/tax-rules.md) describes how every figure is calculated today; update it
along with the code. If you change how a tax figure is calculated, cite the source (AEAT page, BOE article, modelo
instructions) in the pull request and add a test with a worked example.

## Pull requests

- One topic per pull request. Link the issue it fixes.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Follow the [code of conduct](CODE_OF_CONDUCT.md). Report security issues privately — see
  [SECURITY.md](SECURITY.md).
- Include screenshots for UI changes (light and dark).
- By contributing you agree your work is licensed under [AGPL-3.0-or-later](LICENSE).
