# Planning

Once preflight confirms the issue is live and you're on the right branch,
draft the plan before touching code.

## Draft the plan

Load `ponytail:ponytail` first, then invoke `superpowers:writing-plans` (fall
back to a plain written plan only if that skill is unavailable — never skip
writing it down). Ground it in `gh issue view <number> --json body`, not the
title.

The plan must include:

- **Scope** — what the issue asks for, restated in your words, plus what's
  explicitly out of scope. Per `ponytail`: the smallest change that fixes
  the _root cause_, not a redesign. If the bug's root cause is in a shared
  function, fix it there once, not in every caller.
- **Steps** — concrete, ordered, referencing real files. Repo layout is in
  `CLAUDE.md`:
  - `src/screens/` — one screen per route
  - `src/db/` — one module per entity, raw SQL via `getDb()`
  - `src/features/<entity>/` — pure validators / business rules
  - `src/lib/` — cross-cutting pure logic (tax math, dates, CSV, formatting)
  - `src/components/ui/` — design-system primitives (Radix-based)
  - `src-tauri/src/` — Rust: `lib.rs`, `invoicing.rs`, `pdf.rs`,
    `receipt_extract.rs`, `modelo_review.rs`, `llm.rs`, `backup.rs`,
    `expenses.rs`/`contracts.rs`, `export.rs`, `declarations.rs`
  - `src-tauri/migrations/NNNN_*.sql` — schema, registered in `lib.rs`
- **Validation** — which gates apply and any manual check:
  - `bun run lint`
  - `bun run test` (+ `bun run test src/lib/<file>.test.ts` for the new spec)
  - `bun run build` (typecheck)
  - `cd src-tauri && cargo test` — only if Rust touched
  - manual: `bun run tauri dev` and exercise the feature, for behavioral/UI
    changes — flag if you can't do this headless
- **Risks / rollback** — an explicit note when the change touches any hard
  constraint (see the SKILL's Core Directives): migrations + `lib.rs`
  registration + the guard test; the never-change app identifier; tax math
  staying out of Rust; the locked design constraints; the invoice
  immutability triggers (`0008_invoice_lock.sql`) — issued invoices and
  their lines are trigger-protected against UPDATE/DELETE.
- **Tests first** — for a `Bug` or new `src/lib/` / `src-tauri/src/` logic,
  use `superpowers:test-driven-development`: write the failing test
  (`*.test.ts` via vitest, or an inline `#[cfg(test)]` block in Rust) before
  the fix. Name it in the plan.

Skip a section outright (don't pad) when it doesn't apply — a pure docs or
i18n-string change has no migration risk and nothing measurable.

If the solution shape is genuinely unclear, run `superpowers:brainstorming`
before `writing-plans`.

## Confirm before executing

Present the plan and ask the user to confirm — **the default, every time.**

**Hard override — skip the wait entirely** when the user has, at any point,
said anything equivalent to "just go" / "don't wait for me to confirm" /
"skip plan approval" / "go ahead and start" / "no need to check with me".
Then do **not** present-and-pause "just to be safe" — proceed straight to
execution. Still write the plan down (for the PR description); note in the PR
that execution proceeded without an explicit plan confirmation.

If the user requests changes to a presented plan, revise and re-present —
don't partially adopt feedback silently.
