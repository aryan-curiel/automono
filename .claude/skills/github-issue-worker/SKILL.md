---
name: github-issue-worker
description: >-
  Use when asked to work on, pick up, resolve, or implement a specific GitHub
  issue in this repo — e.g. "work on issue #3", "let's do #17", "pick up the
  next P1". Covers verifying the issue is still needed, getting onto (or
  creating) the linked branch, disclosing partial prior work, drafting and
  confirming an implementation plan, running the work behind a draft PR with
  milestone commits, and closing out with a ready-for-review PR plus a work
  summary. Does not cover drafting new issues — see github-issue-creator.
---

# GitHub Issue Worker

Runs the full lifecycle of implementing one existing GitHub issue in
**AutoMono** (`aryan-curiel/automono`): preflight, a written plan, execution
behind a draft PR with milestone updates, CI-gate verification, and a final
ready-for-review handoff.

This is a **single-maintainer private repo**. There's no branch protection
and no required reviewer, but the workflow is still **branch → draft PR →
CI green → ready for review**, because CI runs on PRs (`.github/workflows/ci.yml`)
and the PR is the record of the change. The user merges.

## Quick Start

1. **Preflight** — confirm the issue still needs doing (open, not superseded,
   still matches the code) and get onto the right branch. See
   [references/preflight.md](references/preflight.md).
2. **Plan** — draft a plan with `superpowers:writing-plans` (fall back to a
   plain written plan only if unavailable), grounded in the issue body. Then
   get the user's confirmation — unless they've said to skip waiting. Load
   `ponytail:ponytail` first: the plan should be the smallest root-cause
   change, not a redesign. See [references/planning.md](references/planning.md).
3. **Execute** — open a **draft PR first**, then work the plan, committing at
   each milestone and keeping the PR description current. See
   [references/execution.md](references/execution.md).
4. **Close out** — run the CI gates locally, and when they're green move the
   PR to ready for review in the same flow. Print the report. Still
   [references/execution.md](references/execution.md).
5. **Follow-ups (optional)** — propose spun-off issues via
   `github-issue-creator`, don't file them silently. See
   [references/follow-up-issues.md](references/follow-up-issues.md).

## Core Directives

- **ALWAYS** check both that the issue is unresolved (not closed, no open PR
  already closes it) **and** that its content still matches the current code
  (`file:line` anchors still exist and read as described) before doing
  anything. Say so and stop if either fails. Skip the content check only
  when the user explicitly says to.
- **ALWAYS** work on a branch linked to the issue via `gh issue develop
<n> --checkout`, never directly on `main`. If `main` is behind
  `origin/main`, fast-forward pull before branching.
- **ALWAYS** disclose partial prior work found on an existing issue branch
  and propose a status comment before continuing — confirm the wording
  first.
- **ALWAYS** write the plan down. Get explicit confirmation before executing
  — UNLESS the user has said anything equivalent to "just go" / "don't wait
  for approval" / "skip plan approval", in which case proceed straight to
  execution, note the skip in the PR description, and don't pause.
- **ALWAYS** open the PR as a **draft before** implementation starts. It's
  the running record, not a wrap-up artifact. Use `Closes #<n>` in the body.
- **ALWAYS** commit at each milestone and keep the PR description checklist
  current (metadata edits, no push needed).
- **DO NOT** push after every commit. Push once when the draft PR opens and
  once more at ready-for-review — CI is not free to re-run.
- **ALWAYS** run this repo's gates before flipping ready:
  - `bun run lint`
  - `bun run test` (add a `bun run test <path>` for the specific new/changed
    spec)
  - `bun run build` (this is the typecheck — `build` is `tsc && vite build`)
  - `cd src-tauri && cargo test` — **only if Rust was touched** (`cargo check`
    / `cargo clippy` for a faster inner loop; `cargo test` is what CI runs)
    When they pass, move the PR to ready-for-review in the same flow — don't
    wait for a separate sign-off. Pause only if a gate fails, or the change is
    behavioral/UI and needs the app actually run (`bun run tauri dev`) which
    you can't do headless — say so and ask the user to exercise it.
- **RESPECT** the repo's hard constraints from `CLAUDE.md` — surface an
  explicit risk note in the plan when the change touches any of:
  - **Migrations** — a new `src-tauri/migrations/NNNN_*.sql` must be
    registered in `all_migrations()` in `src-tauri/src/lib.rs` _and_ keep
    the `all_sql_files_are_registered_as_migrations` test green; SQLite can't
    add a NOT NULL FK column or drop a column in one step — use the
    create-copy-drop-rename pattern (see `0013`/`0016`); never drop a table
    without copying its data forward.
  - **The Tauri app identifier** (`com.aryancuriel.automono`) — must never
    change; it's the OS app-data dir key.
  - **Tax math** — lives in `src/lib/` and `src/features/`, not Rust; Rust is
    IO/OS-boundary only.
  - **Design constraints** — one accent color (terracotta), no responsive
    breakpoints, glass only over real scrolling content, motion respects
    `prefers-reduced-motion` (check both themes). See `PRODUCT.md` /
    `DESIGN.md` / `new-design/`.
- **ALWAYS** end by printing the PR URL, the issue URL, a work summary keyed
  to the plan steps, and the validation results.
- **DO NOT** create follow-up issues without explicit approval — propose
  them, then use `github-issue-creator`.
- **DO NOT** push to `main`, force-push, or merge — those need separate
  explicit authorization (session rules + `CLAUDE.md`).

## Reference Directory

| Scenario                                                              | Trigger Keywords                                                              | Reference File                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Is the issue still needed, branch setup, partial-work disclosure      | still open, already fixed, branch, `gh issue develop`, partial work, resume   | [references/preflight.md](references/preflight.md)               |
| Drafting and confirming the plan                                      | plan, validation, writing-plans, ponytail, confirm, risk note                 | [references/planning.md](references/planning.md)                 |
| Draft PR, milestone commits, CI gates, ready-for-review, final report | draft pr, checklist, milestone, bun run, cargo test, ready for review, report | [references/execution.md](references/execution.md)               |
| Proposing/creating follow-up issues                                   | follow-up, spin off, new issue, github-issue-creator                          | [references/follow-up-issues.md](references/follow-up-issues.md) |

## Related Skills

- [[github-issue-creator]] — used here (not duplicated) for any follow-up
  issue.
- [[github-epic-worker]] — the batch orchestrator; dispatches one run of this
  skill per child issue.
- [[superpowers:writing-plans]] / [[superpowers:executing-plans]] — the plan
  is drafted and executed through these.
- [[superpowers:systematic-debugging]] — for any `Bug` issue, run this
  before proposing a fix.
- [[superpowers:test-driven-development]] — write the failing test first for
  bug fixes and new logic in `src/lib/` / `src-tauri/src/`.
- [[superpowers:verification-before-completion]] — run before marking the PR
  ready or reporting done.
- [[ponytail:ponytail]] — the plan and the diff are held to the laziest
  root-cause change.
