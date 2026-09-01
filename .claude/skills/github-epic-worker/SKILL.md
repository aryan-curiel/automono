---
name: github-epic-worker
description: >-
  Use when asked to work an entire Epic (a `Feature`-type issue titled
  `Epic — <Theme>`) in this repo, or when the user wants a set of related
  issues worked as a batch — e.g. "work epic #50", "clear out the backup
  epic", "pick up all the open P1 tax bugs". Enumerates the issue set, infers
  execution order / file conflicts when not stated, and dispatches one
  subagent per issue — each in its own isolated git worktree — parallelizing
  whenever safe. Does not cover a single named issue — see
  github-issue-worker (this skill delegates to it per subagent).
---

# Epic Worker

Orchestrates work across a set of GitHub issues in **AutoMono**
(`aryan-curiel/automono`): resolves the issue set (an epic's child list, or a
label query the user names), works out order and file conflicts, then
dispatches one `github-issue-worker` run per issue via a subagent in its own
git worktree — parallel wherever two issues won't collide, serial otherwise.

AutoMono has no formal epic requirement, so the "issue set" can be either:

- **an epic** — the `- [ ] #<n>` task list in an `Epic — <Theme>` issue body, or
- **a label query** — e.g. "all open `P1` + `tax` issues", "the `backend`
  backlog". The user names the filter; you resolve it with `gh issue list`.

## Quick Start

0. **Check for an existing run** — look for `.claude/epic-runs/<slug>.md`
   (`epic-<N>.md` for an epic, or a query slug like `p1-tax.md`). If
   `in-progress`, this is a resume: dispatch from where it left off. If
   `complete`, report its final state. If absent, proceed. See
   [references/run-state.md](references/run-state.md).
1. **Resolve the issue set** — from the epic body's task list, or the user's
   label query. Drop anything already closed. Pull each remaining issue's
   full body. See
   [references/dependency-resolution.md](references/dependency-resolution.md).
2. **Build the batch plan** — infer explicit dependency phrases and
   file/module conflicts between the issues, group them into ordered batches
   (parallel within a batch, sequential across). Present the plan before
   dispatching anything, unless told to skip waiting. Then write the
   run-state file. See
   [references/dependency-resolution.md](references/dependency-resolution.md)
   and [references/run-state.md](references/run-state.md).
3. **Dispatch each batch** — one subagent per issue, `isolation: "worktree"`,
   each running `github-issue-worker` for its issue number, all `Agent` calls
   in one response. Wait for the batch to finish before the next. Update
   run-state as each issue finishes. See
   [references/dispatch.md](references/dispatch.md).
4. **Report** — per-issue and set-level summary: issue URLs, PR URLs,
   worktree paths, anything that failed or was skipped. Mark run-state
   `complete`.

## Core Directives

- **ALWAYS** check for an existing `.claude/epic-runs/<slug>.md` before
  resolving from scratch — a big batch can outlive one session and this file
  is what lets a fresh session resume without the prior conversation.
- **ALWAYS** write and update the run-state file as the run progresses (after
  the plan is confirmed, and after every issue finishes) — but **NEVER**
  commit it. Exclude `.claude/epic-runs/` via `.git/info/exclude`, not
  `.gitignore`. See [references/run-state.md](references/run-state.md).
- **ALWAYS** re-verify real state (`gh issue view` / `gh pr view`) for any
  non-`done` issue in a resumed run-state file before re-dispatching it.
- **ALWAYS** take the issue set from the epic body's `- [ ] #<n>` task list
  (or the user's stated label query) — don't guess membership from search.
- **ALWAYS** verify each issue's actual state via `gh issue view <n> --json
  state` rather than trusting an epic checkbox — a checked box on an open
  issue is a mismatch; surface it, don't silently pick a side.
- **ALWAYS** determine order and conflicts yourself when not stated — an
  unordered list means "figure out the safe order", not "any order is fine".
- **ALWAYS** present the batch plan (which issues run parallel vs sequential,
  and why) before dispatching a single subagent. **Hard override:** skip
  waiting only if the user said something equivalent to "just go" — same
  trigger-phrase rule `github-issue-worker` uses. Print the plan either way.
- **NEVER** put two issues in the same parallel batch if their bodies
  reference overlapping files/modules — serialize them, even with no explicit
  dependency. AutoMono has hot shared files: `src/App.tsx`,
  `src/db/invoices.ts`, `src/lib/quarterlyDeclaration.ts`,
  `src-tauri/src/lib.rs`, `src/locales/{en,es}/common.json`. Two issues both
  touching one of these = serial.
- **NEVER** parallelize two issues that both add a migration —
  `src-tauri/migrations/` numbering and the `all_migrations()` list in
  `lib.rs` will collide. Serialize migration-adding issues always.
- **ALWAYS** give each subagent its own isolated workspace via the `Agent`
  tool's `isolation: "worktree"` — never a hand-rolled `git worktree add`.
- **ALWAYS** have each subagent run the actual lifecycle by invoking
  `github-issue-worker` for its one issue — don't reimplement branch/plan/PR
  handling here.
- **ALWAYS** issue every `Agent` call for a batch in one response so they run
  concurrently (per `superpowers:dispatching-parallel-agents`).
- **ALWAYS** wait for every subagent in a batch to finish before dispatching
  the next — a later batch may stack on an earlier one's branch.
- **DO NOT** merge, force-push, or push to `main` as part of this flow.
- **ALWAYS** end with a per-issue table (issue URL, PR URL, worktree
  path/branch, status) plus a one-paragraph set-level summary.

## Reference Directory

| Scenario | Trigger Keywords | Reference File |
|---|---|---|
| Resolving the issue set, inferring order/dependencies/conflicts, building batches | epic body, task list, label query, blocked by, depends on, conflict, batch, order | [references/dependency-resolution.md](references/dependency-resolution.md) |
| Spawning subagents in worktrees, prompt structure, waiting on batches, base-branch stacking | subagent, worktree, isolation, dispatch, stacked branch, base | [references/dispatch.md](references/dispatch.md) |
| Persisting/resuming the batch plan and per-issue progress across sessions | resume, run state, progress, checkpoint, session limit, crash | [references/run-state.md](references/run-state.md) |

## Related Skills

- [[github-issue-worker]] — does the per-issue lifecycle (plan, draft PR,
  CI gates, ready-for-review); each dispatched subagent invokes it.
- [[github-issue-creator]] — for any follow-up issue a subagent surfaces.
- [[superpowers:using-git-worktrees]] — the isolation-preference order (native
  tool over manual `git worktree add`); here the native tool is the `Agent`
  tool's `isolation: "worktree"`.
- [[superpowers:dispatching-parallel-agents]] — the parallel-dispatch pattern
  (same-response = concurrent) applied at the batch level.
