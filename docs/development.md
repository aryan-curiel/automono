# Development guide

How to build, test, debug and release AutoMono. For how the code is organised, read
[architecture.md](architecture.md); for contribution rules, [CONTRIBUTING.md](../CONTRIBUTING.md).

## Requirements

| Tool                                    | Why                               | Install                                     |
| --------------------------------------- | --------------------------------- | ------------------------------------------- |
| macOS                                   | The app targets macOS only        | —                                           |
| Xcode Command Line Tools                | Compiler and macOS SDK for Rust   | `xcode-select --install`                    |
| [Rust](https://rustup.rs)               | Tauri backend (stable toolchain)  | `curl … \| sh` from rustup.rs               |
| [Bun](https://bun.sh)                   | Package manager and script runner | `curl -fsSL https://bun.sh/install \| bash` |
| [just](https://just.systems) (optional) | Task shortcuts                    | `brew install just`                         |

Use Bun, not npm or yarn: the lockfile is `bun.lock`.

## First run

```sh
git clone https://github.com/aryan-curiel/automono.git
cd automono
bun install
bun run tauri dev
```

The first `tauri dev` compiles the Rust side and takes a few minutes; later runs are incremental.
The frontend hot-reloads; Rust changes trigger a rebuild and restart.

> **Your dev build uses the same data as the installed app.** Both use the app identifier
> `com.nagarestudio.automono`, so `tauri dev` opens
> `~/Library/Application Support/com.nagarestudio.automono/automono.db`. If you also use AutoMono
> for your real books, run `just backup` (with the app closed) before developing, or work under a
> separate macOS user account.

## Commands

| Command                                | What it does                                                          |
| -------------------------------------- | --------------------------------------------------------------------- |
| `bun run tauri dev`                    | Full app with hot reload (`just dev`)                                 |
| `bun run dev`                          | Vite dev server only, in a browser — Tauri APIs and the DB won't work |
| `bun run build`                        | Type-check (`tsc`) and build the frontend into `dist/`                |
| `bun run test`                         | Vitest, once                                                          |
| `bun run lint`                         | ESLint                                                                |
| `bun run format`                       | Prettier (write)                                                      |
| `cd src-tauri && cargo test`           | Rust tests                                                            |
| `cd src-tauri && cargo check`          | Fast Rust type-check                                                  |
| `just test` / `just lint` / `just fmt` | Both runtimes at once                                                 |

Run a single test file or test:

```sh
bun run test src/lib/lateInterest.test.ts
bun run test src/lib/lateInterest.test.ts -t "test name"
cd src-tauri && cargo test backup::
```

CI (`.github/workflows/ci.yml`) runs lint, Vitest, the frontend build and `cargo test` on every
push to `main` and every pull request. Run the same locally before opening a PR.

## Tests

- **Pure logic** (`src/lib`, `src/features`) has a `*.test.ts` next to each file. New tax or
  business logic needs a test with a worked example.
- **Data access** (`src/db/*.test.ts`) runs real SQL against an in-memory database built by
  replaying every migration with `node:sqlite` (`src/db/migrations.test.ts`).
- **Rust** tests are inline `#[cfg(test)] mod tests` blocks. `all_sql_files_are_registered_as_migrations`
  in `lib.rs` fails if a migration file isn't listed in `all_migrations()`.

## Common tasks

### Add a database migration

1. Create `src-tauri/migrations/NNNN_description.sql` with the next number.
2. Register it in `all_migrations()` in `src-tauri/src/lib.rs` with the same version number.
3. Run `cargo test` and `bun run test`.

Never edit a migration that has shipped. For changes SQLite can't make in place, follow the
create → copy → drop → rename pattern in `0016_invoice_series.sql`.

### Add a screen

Add the component in `src/screens/`, add its name to the `Screen` union in `src/types.ts` and to
`SCREENS` in `src/lib/hashRoute.ts` (the URL hash is the screen name), render it in
`src/App.tsx`, and add a sidebar entry if it needs one. Put strings in
both `src/locales/es/common.json` and `src/locales/en/common.json`.

### Add a Tauri command

Only for things the web view can't do (files, PDFs, Keychain, network calls to AI providers).
Write it in the relevant `src-tauri/src/*.rs` module, add it to `tauri::generate_handler![…]` in
`lib.rs`, and call it with `invoke()` from a thin wrapper in `src/db/` or `src/lib/`. If it takes
a file path from the web view, validate it with `ensure_under_data_dir` (see `contracts.rs`).

### Inspect the database

```sh
sqlite3 ~/Library/Application\ Support/com.nagarestudio.automono/automono.db
```

Close the app first if you plan to write to it.

### Debug the web view

In `tauri dev`, right-click → **Inspect Element** opens Safari Web Inspector. Rust logs go to the
terminal running `tauri dev`.

## Building the app locally

Official releases are signed with a Developer ID and an updater key that only the maintainer has.
To build an unsigned copy for yourself, turn off the update artifacts (they require the updater
private key):

```sh
bun run tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

The app lands in `src-tauri/target/release/bundle/macos/AutoMono.app`. Because it isn't notarized,
macOS will block the first launch: right-click the app → **Open**.

## Releasing (maintainer)

Releases are built in CI from a version tag. The steps:

1. Update `CHANGELOG.md`.
2. `just bump 1.2.0` — sets the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`.
3. Commit and push to `main`.
4. `just release` — checks you're on a clean, pushed `main`, then tags `v1.2.0` and pushes the tag.

The tag starts `.github/workflows/build-macos.yml`, which builds a universal (Apple silicon +
Intel) `.app` and `.dmg`, signs and notarizes them, signs the update bundle and publishes a GitHub
Release with `latest.json`. Installed copies poll that file and offer the update; before
installing, the app runs a backup (`backup_before_update_cmd`).

Required repository secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID`.

> The updater private key must never be lost or rotated casually: its public half is baked into
> every installed copy (`tauri.conf.json → plugins.updater.pubkey`). Without it, existing installs
> can never update again.

`just install` (maintainer only) backs up your data, builds a signed copy and replaces
`/Applications/AutoMono.app`.

## Things you must not change

- The app identifier `com.nagarestudio.automono` — it decides where user data lives.
- Shipped migrations.
- The updater public key.
- Issued invoices — they're locked by a database trigger; corrections go through rectifying
  invoices.
