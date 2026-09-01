# Run State

Persists the batch plan and live per-issue progress for one run to a single
markdown file, so a fresh session can resume a long run without replaying the
prior conversation. Never committed.

## File location

`.claude/epic-runs/<slug>.md`, repo-relative:

- `epic-<N>.md` when working an epic (`<N>` = epic issue number)
- a query slug otherwise, e.g. `p1-tax.md`, `backend-backlog.md`

Before writing it the first time, exclude the directory from git without
touching a tracked file:

```bash
mkdir -p .claude/epic-runs
grep -qxF '.claude/epic-runs/' .git/info/exclude 2>/dev/null || echo '.claude/epic-runs/' >> .git/info/exclude
```

`.git/info/exclude` is local to this clone and untracked — zero diff to
review or accidentally commit, unlike editing `.gitignore`. (`.claude/worktrees/`
is already where this repo keeps isolated worktrees.)

## Format

One file per run, checkboxes flipped in place as issues finish — the same
pattern `superpowers:writing-plans` / `executing-plans` use for a plan file,
applied to a batch schedule.

```markdown
# Run: <epic title or query description>

> github-epic-worker resumable run state. Not committed — safe to delete
> once every issue below is checked done. On resume, the skill reads this
> file instead of re-deriving the batch plan.

**Source:** epic #<N> — <url> | or: query `--label P1 --label tax`
**Status:** in-progress
**Last updated:** <ISO 8601 timestamp>
**Plan approval:** confirmed | skipped ("just go")

## Batch Schedule

| Batch | Issues  | Reason for grouping                                                  |
| ----- | ------- | -------------------------------------------------------------------- |
| 1     | #3, #29 | no dependencies/conflicts                                            |
| 2     | #2      | depends on #31; conflicts with #3 on src/lib/quarterlyDeclaration.ts |

## Issue Status

- [ ] #3 — pending
- [ ] #2 — pending
- [x] #29 — done — PR #61 — worktree `.claude/worktrees/issue-29` (branch `29-csv-injection`)
- [ ] #17 — failed — <reason>; awaiting retry/skip decision

## Notes

<dependency edges, conflicts, anything a resuming session needs>
```

## Writing it

Write once, right after the batch plan is built and confirmed (or
override-skipped) — before dispatching the first batch. `Status` starts
`in-progress`, every issue `pending`.

## Updating it

After **every issue** finishes (not just per batch) — success or failure —
update that issue's checkbox line with its outcome, and bump `Last updated`.
A crash mid-batch shouldn't lose the siblings that already finished.

When the whole run ends (every issue done, failed, or dropped), set
`Status: complete`. Leave the file in place — a fully-checked file is
self-evidently a finished run.

## Resuming

Before running dependency-resolution.md, check whether
`.claude/epic-runs/<slug>.md` exists.

- **Doesn't exist:** normal flow — resolve fresh, then write the file.
- **`Status: complete`:** report its final state; nothing to do.
- **`Status: in-progress`:** this is a resume.
  1. Read the batch schedule and issue statuses from the file — don't
     re-parse the epic body; the file is now the source of truth for scope
     and order.
  2. For every issue **not** marked `done`, re-verify real state:
     `gh issue view <n> --json state` and, if a PR was noted,
     `gh pr view <pr-number> --json state,url` — a subagent may have
     finished right before the session ended. Reconcile the checkbox; don't
     blindly re-dispatch a done issue.
  3. Resume dispatching from the first batch with a non-`done` issue in it.
  4. Keep updating the same file.
